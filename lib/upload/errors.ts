import "server-only";

/**
 * 업로드 요청 오류: HTTP 상태 코드와 사용자에게 보여줄 안내 문구 (docs/architecture.md 6.3)
 * 문구에는 비밀값이나 원본 오류(Pinata 응답 등)를 넣지 않는다. 원본은 서버 로그에만 남긴다.
 */
import { PinataError } from "@/lib/ipfs/pinata";

export class UploadError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 413 | 415 | 500 | 502,
    message: string,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

/** Route Handler의 오류 응답 { error }. 예상하지 못한 오류는 원본을 서버 로그에만 남기고 일반 문구로 응답한다 */
export function toUploadErrorResponse(error: unknown): Response {
  if (error instanceof UploadError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof PinataError) {
    return error.kind === "config"
      ? Response.json({ error: "서버의 업로드 설정이 완료되지 않았습니다. 관리자에게 문의하세요." }, { status: 500 })
      : Response.json({ error: "IPFS 업로드에 실패했습니다. 잠시 후 다시 시도하세요." }, { status: 502 });
  }
  console.error("[upload] 처리하지 못한 오류", error);
  return Response.json({ error: "업로드 처리 중 오류가 발생했습니다." }, { status: 500 });
}
