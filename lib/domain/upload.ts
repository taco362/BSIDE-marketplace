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
