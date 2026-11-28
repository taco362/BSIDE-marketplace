"use client";

import { useRef, useState, type FormEvent } from "react";
import { TxStatus } from "@/components/tx/TxStatus";
import { FormField, INPUT_CLASS, SubmitButton } from "@/components/ui/FormField";
import { PhotoPicker, type SelectedPhoto } from "@/components/upload/PhotoPicker";
import { useTx, type TxStep } from "@/hooks/useTx";
import { signDisputeAuth, uploadDispute, uploadImage, type SignedUploadAuth } from "@/lib/api/upload";
import {
  DISPUTE_REASONS,
  MAX_DISPUTE_DESCRIPTION,
  MAX_DISPUTE_IMAGES,
  checkDisputeInput,
  type DisputeInput,
} from "@/lib/domain/dispute";
import { openDispute } from "@/lib/tx/escrow";

/**
 * 분쟁 제기 (D5·D15): 사유 선택 + 설명 + 사진(선택) → 업로드 확인 서명 → 사진 업로드 → 사유 기록 업로드 → openDispute
 * 사유 기록은 IPFS에 남고 관리자 중재 화면·거래 상세에 표시된다. 컨트랙트에는 사유를 넘기지 않는다.
 * 기한 판정(블록 시각)과 구매자 확인의 최종 판정은 컨트랙트가 한다.
 */
export function DisputeForm({ listingId, onCancel }: { listingId: number; onCancel: () => void }) {
  const tx = useTx();
  const [input, setInput] = useState<DisputeInput>({ reason: null, description: "" });
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [submitted, setSubmitted] = useState(false);
  // 업로드는 끝났는데 분쟁 제기 서명을 거부한 경우, 입력이 같으면 다시 올리지 않는다
  const uploaded = useRef<{ key: string; cid: string } | null>(null);

  const inputError = checkDisputeInput(input);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (inputError || input.reason === null) return;
    const confirmed = window.confirm(
      "분쟁을 제기할까요?\n사유 기록은 IPFS에 남아 고칠 수 없습니다. 자동 정산이 보류되고, 관리자가 구매자 환불 또는 판매자 정산 중 하나로 결정합니다. 제기 후에는 철회할 수 없습니다.",
    );
    if (!confirmed) return;

    const reason = input.reason;
    const description = input.description.trim();
    const inputKey = JSON.stringify([reason, description, photos.map((p) => p.id)]);
    const alreadyUploaded = uploaded.current?.key === inputKey;
    let auth: SignedUploadAuth | null = null;
    const imageCids: string[] = [];

    const uploadSteps: TxStep[] = alreadyUploaded
      ? []
      : [
          {
            label: "업로드 확인 서명 (가스비 없음)",
            send: async (s) => {
              auth = await signDisputeAuth(s, listingId);
              return null;
            },
          },
          ...photos.map(
            (photo, i): TxStep => ({
              label: `사진 업로드 ${i + 1}/${photos.length}`,
              kind: "work",
              send: async () => {
                imageCids.push(await uploadImage(photo.file, auth as SignedUploadAuth));
                return null;
              },
            }),
          ),
          {
            label: "분쟁 사유 기록 업로드",
            kind: "work",
            send: async () => {
              const cid = await uploadDispute({ reason, description }, imageCids, auth as SignedUploadAuth);
              uploaded.current = { key: inputKey, cid };
              return null;
            },
          },
        ];

    await tx.run([...uploadSteps, { label: "분쟁 제기", send: (s) => openDispute(s, listingId) }]);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <fieldset className="flex flex-col gap-1.5" disabled={tx.busy}>
        <legend className="mb-1.5 text-sm font-medium">분쟁 사유</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {DISPUTE_REASONS.map((r) => (
            <label key={r.code} className="flex cursor-pointer items-center gap-1.5">
              <input
                type="radio"
                name="dispute-reason"
                checked={input.reason === r.code}
                onChange={() => setInput({ ...input, reason: r.code })}
              />
              {r.label}
            </label>
          ))}
        </div>
      </fieldset>

      <FormField
        label={input.reason === "other" ? "설명" : "설명 (선택)"}
        htmlFor="dispute-description"
        hint={`최대 ${MAX_DISPUTE_DESCRIPTION}자. 받은 상품의 상태, 배송 상황 등을 적어 주세요.`}
      >
        <textarea
          id="dispute-description"
          value={input.description}
          onChange={(e) => setInput({ ...input, description: e.target.value })}
          maxLength={MAX_DISPUTE_DESCRIPTION}
          rows={3}
          disabled={tx.busy}
          className={INPUT_CLASS}
        />
      </FormField>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">사진 (선택, 최대 {MAX_DISPUTE_IMAGES}장)</span>
        <PhotoPicker id="dispute-photos" value={photos} onChange={setPhotos} max={MAX_DISPUTE_IMAGES} disabled={tx.busy} />
      </div>

      {submitted && inputError && <p className="text-xs text-red-600">{inputError}</p>}
      <p className="text-xs text-zinc-500">
        사유·설명·사진은 IPFS에 올라가 누구나 볼 수 있고 고칠 수 없습니다. 개인정보는 적지 마세요. MetaMask 요청은 2번입니다
        (업로드 확인 서명, 분쟁 제기).
      </p>
      <div className="flex gap-3">
        <SubmitButton disabled={tx.busy}>{tx.busy ? "처리 중…" : "분쟁 제기"}</SubmitButton>
        <button
          type="button"
          onClick={onCancel}
          disabled={tx.busy}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          닫기
        </button>
      </div>
      <TxStatus state={tx} />
    </form>
  );
}
