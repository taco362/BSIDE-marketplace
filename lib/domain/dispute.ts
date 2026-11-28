/**
 * 분쟁 사유 기록 (proposal.md D15, docs/architecture.md 6.8). 외부 의존 없음.
 * 구매자가 분쟁 제기 전에 사유·설명·사진을 남기고, 서버가 IPFS에 올린다.
 * 서버(Route Handler)와 브라우저가 같은 값·같은 확인 함수를 쓴다.
 */
import { isSameAddress } from "./format";
import type { Listing } from "./types";
import { isCid } from "./upload";

/** 분쟁 사유 (D15). 코드는 기록에 남는 값이므로 바꾸지 않는다 */
export const DISPUTE_REASONS = [
  { code: "not_received", label: "상품 미수령" },
  { code: "condition_mismatch", label: "상태 기록과 다름" },
  { code: "damaged", label: "배송 중 파손" },
  { code: "counterfeit", label: "가품 의심" },
  { code: "other", label: "기타" },
] as const;
export type DisputeReason = (typeof DISPUTE_REASONS)[number]["code"];

/** 설명 최대 글자 수 (D15) */
export const MAX_DISPUTE_DESCRIPTION = 500;
/** 사진 최대 장수 (D15, 선택) */
export const MAX_DISPUTE_IMAGES = 3;

export function isDisputeReason(value: unknown): value is DisputeReason {
  return DISPUTE_REASONS.some((r) => r.code === value);
}

export function disputeReasonLabel(reason: DisputeReason): string {
  return DISPUTE_REASONS.find((r) => r.code === reason)?.label ?? reason;
}

/** 구매자가 입력하는 값 */
export interface DisputeInput {
  /** 화면에서 아직 고르지 않았으면 null */
  reason: DisputeReason | null;
  description: string;
}

/** 입력 확인. 문제가 있으면 안내 문구, 없으면 null. 설명은 "기타"일 때만 필수 (D15) */
export function checkDisputeInput(input: DisputeInput): string | null {
  if (input.reason === null) return "분쟁 사유를 선택하세요.";
  if (input.reason === "other" && !input.description.trim()) return "\"기타\"를 고르면 설명을 입력해야 합니다.";
  if (input.description.length > MAX_DISPUTE_DESCRIPTION) {
    return `설명은 ${MAX_DISPUTE_DESCRIPTION}자 이하로 입력하세요.`;
  }
  return null;
}

export function checkDisputeImageCount(count: number): string | null {
  return count > MAX_DISPUTE_IMAGES ? `사진은 ${MAX_DISPUTE_IMAGES}장까지 올릴 수 있습니다.` : null;
}

/** IPFS에 올라가는 분쟁 사유 기록 JSON. listingId·tokenId·buyer·createdAt은 서버가 채운다 */
export interface DisputeRecord {
  type: "dispute";
  listingId: number;
  tokenId: number;
  buyer: string;
  reason: DisputeReason;
  /** 비어 있을 수 있다 ("기타"가 아니면 선택) */
  description: string;
  /** 사진 CID 0~3개 */
  images: string[];
  createdAt: string;
}

/** 화면 조회 결과 */
export type DisputeRecordResult =
  | { status: "ok"; record: DisputeRecord; cid: string }
  /** 이 거래의 사유 기록이 없음 (사유 기록 기능 전에 제기된 분쟁, 화면을 거치지 않은 제기) */
  | { status: "none" }
  /** 검색·게이트웨이 조회 실패 */
  | { status: "unavailable" };

/**
 * IPFS에서 읽은 값을 형식 확인 후 기록으로 돌려준다. 형식이 맞지 않거나 이 거래·구매자의 기록이 아니면 null.
 * 서버만 꼬리표를 붙여 올리지만, 읽을 때도 거래 번호와 구매자 주소를 다시 맞춰 본다.
 */
export function parseDisputeRecord(
  value: unknown,
  listing: Pick<Listing, "listingId" | "tokenId" | "buyer">,
): DisputeRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.type !== "dispute") return null;
  if (v.listingId !== listing.listingId || v.tokenId !== listing.tokenId) return null;
  if (typeof v.buyer !== "string" || !isSameAddress(v.buyer, listing.buyer)) return null;
  if (!isDisputeReason(v.reason)) return null;
  if (typeof v.description !== "string" || v.description.length > MAX_DISPUTE_DESCRIPTION) return null;
  if (!Array.isArray(v.images) || v.images.length > MAX_DISPUTE_IMAGES || !v.images.every(isCid)) return null;
  if (typeof v.createdAt !== "string") return null;
  return {
    type: "dispute",
    listingId: listing.listingId,
    tokenId: listing.tokenId,
    buyer: v.buyer,
    reason: v.reason,
    description: v.description,
    images: v.images,
    createdAt: v.createdAt,
  };
}

/** Pinata 꼬리표 키. 값으로 거래를 찾는다 (D15, 컨트랙트에는 사유 기록 CID를 남기지 않음) */
export const DISPUTE_TAG_KEY = "bsideDispute";

/** 꼬리표 값: 체인·에스크로 주소·거래 번호. 로컬·Sepolia·재배포한 컨트랙트의 같은 거래 번호가 섞이지 않게 한다 */
export function disputeTagValue(chainId: number, escrowAddress: string, listingId: number): string {
  return `${chainId}:${escrowAddress.toLowerCase()}:${listingId}`;
}
