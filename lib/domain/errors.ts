/**
 * 메시지를 그대로 사용자에게 보여줘도 되는 오류 (외부 의존 없음)
 * 지갑 오류(lib/wallet), 업로드 요청 오류(lib/api) 등이 상속한다. hooks/useTx는 이 오류면 메시지를 그대로 표시한다.
 */
export class UserFacingError extends Error {}
