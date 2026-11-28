import "server-only";

/**
 * Gemini API 호출 (docs/architecture.md 6.7, proposal.md D14)
 * - SDK 없이 REST generateContent를 직접 호출한다 (의존성 추가 없음).
 * - 비용 최소화: 무료 등급 키(결제 미연결) 사용을 전제로, 생각(thinking) 최소화·출력 토큰 상한·형식 고정 JSON 출력.
 * - API 키는 서버 전용 환경 변수 GEMINI_API_KEY. URL이 아니라 헤더로 보낸다 (로그에 남지 않게).
 */

/** 최신 안정판 Flash-Lite (2026-11-28 공식 모델 목록 확인) */
export const GEMINI_MODEL = "gemini-3.5-flash-lite";

const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const TIMEOUT_MS = 25_000;

export class AiError extends Error {
  constructor(
    /** config: 키 없음 / quota: 무료 사용량 초과(429) / failed: 연결·응답 실패 / output: 응답 형식 이상·차단 */
    readonly kind: "config" | "quota" | "failed" | "output",
    message: string,
  ) {
    super(message);
    this.name = "AiError";
  }
}

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export interface GenerateJsonOptions {
  /** 역할·규칙 (사용자 입력과 분리) */
  systemInstruction: string;
  parts: GeminiPart[];
  /** 응답 JSON Schema */
  schema: Record<string, unknown>;
  maxOutputTokens: number;
}

/** 형식을 고정한 JSON 응답을 받아 파싱한 값을 돌려준다. 내용 확인은 호출하는 쪽이 한다 */
export async function generateJson({ systemInstruction, parts, schema, maxOutputTokens }: GenerateJsonOptions): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new AiError("config", "GEMINI_API_KEY가 설정되지 않았습니다.");

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: schema,
          maxOutputTokens,
          temperature: 0.2,
          thinkingConfig: { thinkingLevel: "MINIMAL" },
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    console.error("[gemini] 연결 실패", error);
    throw new AiError("failed", "AI 서버에 연결하지 못했습니다.");
  }

  if (!response.ok) {
    // 원본 응답은 서버 로그에만 남긴다 (키는 헤더로 보냈으므로 응답·URL에 없다)
    const detail = await response.text().catch(() => "");
    console.error("[gemini] 오류 응답", response.status, detail.slice(0, 500));
    if (response.status === 429) throw new AiError("quota", "AI 무료 사용량을 초과했습니다.");
    throw new AiError("failed", `AI 응답 오류 (HTTP ${response.status})`);
  }

  const body = (await response.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  } | null;
  const candidate = body?.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) {
    console.error("[gemini] 빈 응답", candidate?.finishReason);
    throw new AiError("output", "AI가 응답을 만들지 못했습니다.");
  }
  try {
    return JSON.parse(text);
  } catch {
    console.error("[gemini] JSON 아님", candidate?.finishReason, text.slice(0, 200));
    throw new AiError("output", "AI 응답 형식이 올바르지 않습니다.");
  }
}
