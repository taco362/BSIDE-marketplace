/**
 * 업로드 제한 값과 업로드 확인 서명 문장 (docs/architecture.md 6.3, proposal.md D11·D12)
 * 서버(Route Handler)와 브라우저가 같은 값·같은 문장을 쓴다. 외부 의존 없음.
 */

/** 상태 기록 사진 개수 (D11) */
export const MIN_CONDITION_IMAGES = 1;
export const MAX_CONDITION_IMAGES = 5;

/** 사진 1장 최대 크기 (D11): 4MB */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** 허용 사진 형식 (D11). 서버는 파일 앞부분 바이트로 판별한다 */
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

export const IMAGE_EXTENSIONS: Record<ImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** 상태 기록 글자 수 상한 (구현 상한: 요청 크기와 남용 방지용, 정책 값 아님) */
export const MAX_CONDITION_TEXT = 1000;
/** 하자 정보를 비우면 기록되는 값 (D11) */
export const NO_DEFECTS = "없음";

/** 판매자가 입력하는 상품 상태 (D11). tokenId·seller·createdAt·images는 서버가 채운다 (D12) */
export interface ConditionInput {
  /** true: 미개봉, false: 개봉 */
  sealed: boolean;
  /** 사용 상태 설명 (필수) */
  condition: string;
  /** 하자 정보 (선택, 비우면 "없음") */
  defects: string;
}

/** IPFS에 올라가는 상태 기록 JSON (architecture.md 6.3) */
export interface ConditionRecord extends ConditionInput {
  tokenId: number;
  seller: string;
  images: string[];
  createdAt: string;
}

/** CID 형식 (v0: Qm…, v1: base32 b…) */
export function isCid(value: unknown): value is string {
  return typeof value === "string" && /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,})$/.test(value);
}

/** 상태 입력 확인. 문제가 있으면 안내 문구, 없으면 null */
export function checkConditionInput(input: ConditionInput): string | null {
  if (!input.condition.trim()) return "사용 상태를 입력하세요.";
  if (input.condition.length > MAX_CONDITION_TEXT) return `사용 상태는 ${MAX_CONDITION_TEXT}자 이하로 입력하세요.`;
  if (input.defects.length > MAX_CONDITION_TEXT) return `하자 정보는 ${MAX_CONDITION_TEXT}자 이하로 입력하세요.`;
  return null;
}

/** 사진 개수 확인 (D11) */
export function checkImageCount(count: number): string | null {
  if (count < MIN_CONDITION_IMAGES) return `사진을 ${MIN_CONDITION_IMAGES}장 이상 올리세요.`;
  if (count > MAX_CONDITION_IMAGES) return `사진은 ${MAX_CONDITION_IMAGES}장까지 올릴 수 있습니다.`;
  return null;
}

/** 브라우저에서 고른 파일의 형식·크기 안내 (최종 판별은 서버가 파일 바이트로 한다) */
export function checkImageFile(file: { type: string; size: number }): string | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return "JPEG, PNG, WebP 사진만 올릴 수 있습니다.";
  if (file.size > MAX_IMAGE_BYTES) return `사진은 장당 ${MAX_IMAGE_BYTES / 1024 / 1024}MB 이하만 올릴 수 있습니다.`;
  return null;
}

/** 업로드 확인 서명 유효 시간 (초): 서명 시각이 이 시간보다 오래되면 거부 */
export const UPLOAD_AUTH_MAX_AGE_SECONDS = 300;
/** 서명 시각이 서버 시각보다 앞선 것을 허용하는 범위 (초, 시계 차이) */
export const UPLOAD_AUTH_MAX_SKEW_SECONDS = 60;

/**
 * 업로드 용도 (D12)
 * - condition: 판매 등록용 상품 상태 기록 → 해당 NFT의 현재 소유자만
 * - metadata: 발행용 메타데이터 → 승인된 아티스트만
 */
export const UPLOAD_PURPOSES = ["condition", "metadata"] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

export interface UploadAuthFields {
  purpose: UploadPurpose;
  /** condition일 때 필수, metadata일 때 null */
  tokenId: number | null;
  address: string;
  chainId: number;
  /** 서명 시각 (unix 초) */
  issuedAt: number;
}

/**
 * MetaMask에 표시되고 서명되는 문장 (EIP-191 personal_sign).
 * 서버는 요청 값으로 같은 문장을 다시 만들어 서명자를 확인하므로, 이 함수의 출력이 바뀌면 이전 서명은 무효가 된다.
 */
export function buildUploadMessage(f: UploadAuthFields): string {
  const purpose = f.purpose === "condition" ? `상품 상태 기록 (NFT #${f.tokenId})` : "NFT 발행 메타데이터";
  return [
    "B-SIDE 업로드 확인",
    `용도: ${purpose}`,
    `지갑: ${f.address.toLowerCase()}`,
    `체인: ${f.chainId}`,
    `시각: ${f.issuedAt}`,
    "이 서명은 가스비가 들지 않으며 거래를 실행하지 않습니다.",
  ].join("\n");
}
