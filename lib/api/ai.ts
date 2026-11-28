/**
 * AI API 호출 (클라이언트 전용, docs/architecture.md 6.7)
 * - requestConditionDraft: 사진(줄인 사본) → POST /api/ai/condition-draft → 상태 초안
 * - requestTokenSummary: NFT 번호 → POST /api/ai/token-summary → 거래 이력 요약
 * AI 키는 서버에만 있다. 브라우저는 우리 서버 API만 호출한다.
 */
import { AI_DRAFT_IMAGE_MAX_SIDE, type ConditionDraft } from "@/lib/domain/ai";
import { UserFacingError } from "@/lib/domain/errors";
import { downscaleToJpeg } from "@/lib/media/downscale";
import type { SignedUploadAuth } from "./upload";

export class AiRequestError extends UserFacingError {}

/** 거래 이력 요약 → { summary, ai } (ai: AI가 쓴 문장인지. 거래가 없으면 서버가 정한 문장) */
export async function requestTokenSummary(tokenId: number): Promise<{ summary: string; ai: boolean }> {
  let response: Response;
  try {
    response = await fetch("/api/ai/token-summary", {
      method: "POST",
      body: JSON.stringify({ tokenId }),
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    throw new AiRequestError("서버에 연결하지 못했습니다. 네트워크를 확인하고 다시 시도하세요.");
  }
  const body = (await response.json().catch(() => null)) as { summary?: string; ai?: boolean; error?: string } | null;
  if (!response.ok || typeof body?.summary !== "string") {
    throw new AiRequestError(body?.error ?? `AI 요약을 받지 못했습니다 (HTTP ${response.status}).`);
  }
  return { summary: body.summary, ai: body.ai === true };
}

export async function requestConditionDraft(files: File[], auth: SignedUploadAuth): Promise<ConditionDraft> {
  let images: Blob[];
  try {
    images = await Promise.all(files.map((f) => downscaleToJpeg(f, AI_DRAFT_IMAGE_MAX_SIDE)));
  } catch {
    throw new AiRequestError("사진을 읽지 못했습니다. 다른 사진으로 다시 시도하세요.");
  }

  const form = new FormData();
  images.forEach((image, i) => form.append("files", image, `photo-${i + 1}.jpg`));
  form.append("tokenId", String(auth.tokenId));
  form.append("address", auth.address);
  form.append("issuedAt", String(auth.issuedAt));
  form.append("signature", auth.signature);

  let response: Response;
  try {
    response = await fetch("/api/ai/condition-draft", { method: "POST", body: form });
  } catch {
    throw new AiRequestError("서버에 연결하지 못했습니다. 네트워크를 확인하고 다시 시도하세요.");
  }
  const body = (await response.json().catch(() => null)) as { draft?: ConditionDraft; error?: string } | null;
  if (!response.ok || !body?.draft) {
    throw new AiRequestError(body?.error ?? `AI 초안을 받지 못했습니다 (HTTP ${response.status}).`);
  }
  return body.draft;
}
