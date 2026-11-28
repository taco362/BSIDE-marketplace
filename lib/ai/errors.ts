import "server-only";

/**
 * AI API의 오류 응답 { error } (docs/architecture.md 6.7)
 * 문구에는 키·원본 응답을 넣지 않는다 (원본은 lib/ai/gemini.ts가 서버 로그에 남긴다).
 * 서명·권한·사진 확인 오류(UploadError)는 업로드 API와 같은 방식으로 응답한다.
 */
import { toUploadErrorResponse } from "@/lib/upload/errors";
import { AiError } from "./gemini";

const MESSAGES: Record<AiError["kind"], { status: number; error: string }> = {
  config: { status: 500, error: "서버의 AI 설정이 완료되지 않았습니다. 관리자에게 문의하세요." },
  quota: { status: 429, error: "AI 무료 사용량을 초과했습니다. 잠시 후(또는 내일) 다시 시도하거나 직접 입력하세요." },
  failed: { status: 502, error: "AI 응답을 받지 못했습니다. 잠시 후 다시 시도하거나 직접 입력하세요." },
  output: { status: 502, error: "AI가 초안을 만들지 못했습니다. 다른 사진으로 다시 시도하거나 직접 입력하세요." },
};

export function toAiErrorResponse(error: unknown): Response {
  if (error instanceof AiError) {
    const { status, error: message } = MESSAGES[error.kind];
    return Response.json({ error: message }, { status });
  }
  return toUploadErrorResponse(error);
}
