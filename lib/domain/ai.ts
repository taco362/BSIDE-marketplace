/**
 * AI 보조 기능 공용 값 (docs/architecture.md 6.7, proposal.md D14). 서버·브라우저 공용, 외부 의존 없음.
 */

/**
 * AI 초안용 사진은 브라우저에서 긴 변을 이 크기(px) 이하로 줄여 보낸다.
 * 이미지 입력 토큰과 요청 크기를 줄이기 위함이다 (IPFS에 올리는 원본 사진은 줄이지 않는다).
 */
export const AI_DRAFT_IMAGE_MAX_SIDE = 768;

/** AI 초안 요청 1건의 최대 크기 (사진 최대 5장, 호스팅 요청 크기 제한 4.5MB 안) */
export const MAX_AI_DRAFT_REQUEST_BYTES = 4 * 1024 * 1024;

/** AI 초안의 사용 상태 설명 글자 수 상한 (구현 상한) */
export const MAX_AI_CONDITION_TEXT = 300;
