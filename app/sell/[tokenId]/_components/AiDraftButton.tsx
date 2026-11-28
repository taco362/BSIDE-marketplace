"use client";

import { TxStatus } from "@/components/tx/TxStatus";
import type { SelectedPhoto } from "@/components/upload/PhotoPicker";
import { useTx } from "@/hooks/useTx";
import { requestConditionDraft } from "@/lib/api/ai";
import { signUploadAuth, type SignedUploadAuth } from "@/lib/api/upload";
import type { ConditionInput } from "@/lib/domain/upload";

/**
 * AI 상태 초안 받기 (architecture.md 6.7 A2, D14)
 * 업로드 확인 서명(가스비 없음) → 고른 사진의 줄인 사본을 AI에 보내 초안을 받는다 → 입력 칸에 채운다.
 * 초안은 판매자가 확인·수정해서 등록한다.
 */
export function AiDraftButton({
  tokenId,
  photos,
  disabled,
  onDraft,
}: {
  tokenId: number;
  photos: SelectedPhoto[];
  disabled: boolean;
  onDraft: (draft: ConditionInput) => void;
}) {
  const tx = useTx();

  async function onClick() {
    let auth: SignedUploadAuth | null = null;
    let draft: ConditionInput | null = null;
    const done = await tx.run([
      {
        label: "AI 초안용 확인 서명 (가스비 없음)",
        send: async (s) => {
          auth = await signUploadAuth(s, "condition", tokenId);
          return null;
        },
      },
      {
        label: "AI가 사진을 보고 초안 작성",
        kind: "work",
        send: async () => {
          draft = await requestConditionDraft(
            photos.map((p) => p.file),
            auth as SignedUploadAuth,
          );
          return null;
        },
      },
    ]);
    if (done && draft) onDraft(draft);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || tx.busy || photos.length === 0}
        className="self-start rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        {tx.busy ? "AI 초안 작성 중…" : "✨ 사진으로 AI 초안 받기"}
      </button>
      <p className="text-xs text-zinc-500">
        {photos.length === 0 ? "사진을 먼저 고르면 사용할 수 있습니다. " : ""}
        사진의 줄인 사본이 AI(Google Gemini)로 보내집니다. 초안은 참고용이니 실제 상태와 다르면 고쳐서 등록하세요. AI
        초안을 받은 기록에는 &quot;AI 초안 활용&quot; 표시가 남습니다.
      </p>
      <TxStatus state={tx} successMessage="AI 초안을 입력 칸에 채웠습니다. 내용을 확인하세요." />
    </div>
  );
}
