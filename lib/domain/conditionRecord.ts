/**
 * 상품 상태 기록 읽기·확인 (docs/architecture.md 6.6, U4)
 * 게이트웨이에서 읽은 JSON은 믿지 않는다: 컨트랙트 list를 직접 호출하면 아무 CID로나 등록할 수 있기 때문이다 (D12 한계).
 * 형식을 확인해 화면에 쓸 값만 꺼내고, 거래 정보와 어긋나면 경고 문구를 만든다. 외부 의존 없음.
 */
import { isSameAddress } from "./format";
import type { Listing } from "./types";
import { MAX_CONDITION_IMAGES, isCid, type ConditionRecord } from "./upload";

/** 화면에 넘기는 상태 기록 조회 결과 */
export type ConditionRecordResult =
  | { status: "ok"; record: ConditionRecord }
  /** CID 형식 아님, JSON 아님, 상태 기록 형식 아님 */
  | { status: "invalid" }
  /** 게이트웨이 연결·응답 실패 (새로고침하면 될 수 있음) */
  | { status: "unavailable" };

/** "ipfs://<CID>" → CID. 다른 형식이면 null */
export function cidFromIpfsUri(uri: string): string | null {
  if (!uri.startsWith("ipfs://")) return null;
  const cid = uri.slice("ipfs://".length);
  return isCid(cid) ? cid : null;
}

/** 상태 기록 JSON 형식 확인. 맞지 않으면 null. type이 없는 기록은 재판매 기록으로 읽는다 (6.3) */
export function parseConditionRecord(value: unknown): ConditionRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const { tokenId, seller, images, createdAt, condition } = v;

  if (typeof tokenId !== "number" || !Number.isSafeInteger(tokenId)) return null;
  if (typeof seller !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(seller)) return null;
  if (typeof createdAt !== "string" || typeof condition !== "string") return null;
  if (!Array.isArray(images) || images.length > MAX_CONDITION_IMAGES || !images.every(isCid)) return null;
  const base = { tokenId, seller, images, createdAt, condition };

  if (v.type === "primary") {
    if (typeof v.metadata !== "string") return null;
    return { ...base, type: "primary", metadata: v.metadata };
  }
  if (v.type !== undefined && v.type !== "resale") return null;
  if (typeof v.sealed !== "boolean" || typeof v.defects !== "string") return null;
  return { ...base, type: "resale", sealed: v.sealed, defects: v.defects };
}

/** 기록이 이 거래와 맞지 않으면 경고 문구 목록 (화면을 거치지 않고 등록된 경우) */
export function conditionRecordWarnings(
  record: ConditionRecord,
  listing: Pick<Listing, "tokenId" | "seller" | "isPrimary">,
): string[] {
  const warnings: string[] = [];
  if (record.tokenId !== listing.tokenId) {
    warnings.push(`기록의 NFT 번호(#${record.tokenId})가 이 거래의 NFT(#${listing.tokenId})와 다릅니다.`);
  }
  if (!isSameAddress(record.seller, listing.seller)) warnings.push("기록의 판매자가 이 거래의 판매자와 다릅니다.");
  if (record.type === "primary" && !listing.isPrimary) {
    warnings.push("최초 판매 기록이지만 이 거래는 재판매입니다.");
  }
  return warnings;
}
