"use client";

import { Suspense, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { TxStatus } from "@/components/tx/TxStatus";
import { FormField, INPUT_CLASS, SubmitButton } from "@/components/ui/FormField";
import { PhotoPicker, type SelectedPhoto } from "@/components/upload/PhotoPicker";
import { NetworkGuard } from "@/components/wallet/NetworkGuard";
import { useTx, type TxStep } from "@/hooks/useTx";
import {
  signUploadAuth,
  uploadCondition,
  uploadImage,
  uploadPrimaryCondition,
  type SignedUploadAuth,
} from "@/lib/api/upload";
import type { PriorCondition } from "@/lib/domain/conditionHistory";
import { formatEth, isSameAddress, parseEth } from "@/lib/domain/format";
import { checkListingPrice, formatBps, listingPriceRule, type ListingPriceRule } from "@/lib/domain/policy";
import type { Token } from "@/lib/domain/types";
import {
  MAX_CONDITION_IMAGES,
  checkConditionInput,
  checkImageCount,
  type ConditionInput,
} from "@/lib/domain/upload";
import { list, listedListingId } from "@/lib/tx/escrow";
import { approveEscrowIfNeeded } from "@/lib/tx/nft";
import { AiDraftButton } from "./AiDraftButton";
import { ConditionFields } from "./ConditionFields";
import { PriorConditionNotice } from "./PriorConditionNotice";

/**
 * 판매 등록 (architecture.md 6.2, 6.3)
 * 업로드 확인 서명 → 사진 업로드 → 상태 기록 업로드(서버가 tokenId·판매자·시각을 채움) → NFT 사용 승인(approve) → 판매 등록(list)
 * 최초 판매는 사진·상태 입력 없이 서명 → 서버가 상태 기록 작성(대표 이미지 사용, D11) → approve → list
 * 가격 규칙은 연결된 계정(판매자) 기준으로 미리 안내하고, 최종 검증은 컨트랙트가 한다.
 */
export function SellForm({
  token,
  priorConditions,
}: {
  token: Token;
  /** 이전 완료 거래의 상태 기록 (모순 안내용, 6.7 A1). 서버가 기다리지 않고 넘긴다 */
  priorConditions: Promise<PriorCondition[]>;
}) {
  // 등록 후 router.refresh()로 NFT가 에스크로 보관 상태가 되어도 결과를 계속 보여준다.
  // Cache Components는 방문했던 화면의 상태를 보존하므로(<Activity>), 완료 표시는 현재 서버 상태(에스크로 보관 중)일 때만 쓴다.
  // 등록 취소 후 이 화면으로 돌아오면 다시 폼이 보인다.
  const [listingId, setListingId] = useState<number | null>(null);

  if (listingId !== null && token.inEscrow) {
    return (
      <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
        판매 등록을 완료했습니다.{" "}
        <Link href={`/listings/${listingId}`} className="underline underline-offset-2">
          거래 #{listingId} 보기
        </Link>
      </p>
    );
  }

  return (
    <NetworkGuard>
      {(account) => {
        if (token.inEscrow) {
          return <Notice>이 NFT는 이미 판매 등록되어 에스크로에 보관 중입니다.</Notice>;
        }
        if (!isSameAddress(token.owner, account)) {
          return <Notice>연결된 계정은 이 NFT의 소유자가 아닙니다. 소유자 계정으로 전환하세요.</Notice>;
        }
        return (
          <Form
            token={token}
            rule={listingPriceRule(token, account)}
            sellerIsArtist={isSameAddress(account, token.artist)}
            priorConditions={priorConditions}
            onListed={setListingId}
          />
        );
      }}
    </NetworkGuard>
  );
}

function Form({
  token,
  rule,
  sellerIsArtist,
  priorConditions,
  onListed,
}: {
  token: Token;
  rule: ListingPriceRule;
  sellerIsArtist: boolean;
  priorConditions: Promise<PriorCondition[]>;
  onListed: (listingId: number) => void;
}) {
  const tx = useTx();
  const [priceText, setPriceText] = useState("");
  const [condition, setCondition] = useState<ConditionInput>({ sealed: true, condition: "", defects: "" });
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  // AI 초안을 한 번이라도 받아 채웠으면 기록에 표시한다 (판매자 자기 신고, 6.7 A2)
  const [aiAssisted, setAiAssisted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // 업로드는 끝났는데 승인·등록 서명을 거부한 경우, 입력이 같으면 다시 올리지 않고 같은 상태 기록 CID를 쓴다
  const uploaded = useRef<{ key: string; cid: string } | null>(null);

  // 최초 판매는 상태·사진을 입력하지 않고 서버가 기록을 작성한다 (D11)
  const primary = rule.kind === "primary";
  const price = rule.kind === "primary" ? rule.price : parseEth(priceText);
  const priceError =
    price === null ? "ETH 금액을 숫자로 입력하세요 (예: 0.05)." : checkListingPrice(rule, price);
  const conditionError = primary ? null : checkConditionInput(condition);
  const photoError = primary ? null : checkImageCount(photos.length);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (priceError || conditionError || photoError || price === null) return;

    const inputKey = primary ? "primary" : JSON.stringify([condition, photos.map((p) => p.id), aiAssisted]);
    let conditionCid = uploaded.current?.key === inputKey ? uploaded.current.cid : null;
    let auth: SignedUploadAuth | null = null;
    const imageCids: string[] = [];

    const photoSteps = (primary ? [] : photos).map(
      (photo, i): TxStep => ({
        label: `사진 업로드 ${i + 1}/${photos.length}`,
        kind: "work",
        send: async () => {
          imageCids.push(await uploadImage(photo.file, auth as SignedUploadAuth));
          return null;
        },
      }),
    );

    const uploadSteps: TxStep[] = conditionCid
      ? []
      : [
          {
            label: "업로드 확인 서명 (가스비 없음)",
            send: async (s) => {
              auth = await signUploadAuth(s, "condition", token.tokenId);
              return null;
            },
          },
          ...photoSteps,
          {
            label: primary ? "최초 판매 상태 기록 작성" : "상품 상태 기록 업로드",
            kind: "work",
            send: async () => {
              const signed = auth as SignedUploadAuth;
              conditionCid = primary
                ? await uploadPrimaryCondition(signed)
                : await uploadCondition(condition, imageCids, signed, aiAssisted);
              uploaded.current = { key: inputKey, cid: conditionCid };
              return null;
            },
          },
        ];

    const receipts = await tx.run([
      ...uploadSteps,
      { label: "NFT 사용 승인 (에스크로)", send: (s) => approveEscrowIfNeeded(s, token.tokenId) },
      { label: "판매 등록", send: (s) => list(s, token.tokenId, price, conditionCid as string) },
    ]);
    const listReceipt = receipts?.at(-1);
    if (listReceipt) {
      const id = listedListingId(listReceipt);
      if (id !== null) onListed(id);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-5">
      {rule.kind === "primary" ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">판매 가격</span>
          <p className="text-lg font-semibold">{formatEth(rule.price)}</p>
          <p className="text-xs text-zinc-500">최초 판매는 발행 시 정한 최초 판매가로 고정됩니다 (D1).</p>
        </div>
      ) : (
        <FormField
          label="판매 가격 (ETH)"
          htmlFor="sell-price"
          hint={priceHint(rule, token, sellerIsArtist)}
          error={submitted ? priceError : null}
        >
          <input
            id="sell-price"
            value={priceText}
            onChange={(e) => setPriceText(e.target.value)}
            inputMode="decimal"
            placeholder={rule.kind === "cap" ? formatEth(rule.cap).replace(" ETH", "") : "0.05"}
            autoComplete="off"
            className={INPUT_CLASS}
          />
        </FormField>
      )}

      {primary ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">상품 상태</span>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            최초 판매는 상태·사진을 따로 입력하지 않습니다. &quot;아티스트 최초 판매 상품&quot;으로 기록되고, 사진은 발행
            때 올린 대표 이미지를 씁니다.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">상품 사진</span>
            <PhotoPicker
              id="condition-photos"
              value={photos}
              onChange={setPhotos}
              max={MAX_CONDITION_IMAGES}
              disabled={tx.busy}
            />
            {submitted && photoError && <p className="text-xs text-red-600">{photoError}</p>}
          </div>

          <AiDraftButton
            tokenId={token.tokenId}
            photos={photos}
            disabled={tx.busy}
            onDraft={(draft) => {
              setCondition(draft);
              setAiAssisted(true);
            }}
          />

          <ConditionFields
            value={condition}
            onChange={setCondition}
            error={submitted ? conditionError : null}
            disabled={tx.busy}
          />
          {aiAssisted && (
            <p className="text-xs text-violet-700 dark:text-violet-400">
              AI 초안을 사용했습니다. 이 판매 건의 상태 기록에 &quot;AI 초안 활용&quot;으로 표시됩니다.
            </p>
          )}
          <Suspense fallback={null}>
            <PriorConditionNotice value={condition} prior={priorConditions} />
          </Suspense>
        </>
      )}

      <p className="text-xs text-zinc-500">
        {primary ? "상태 기록은" : "상태 정보와 사진은"} 이 판매 건의 기록으로 IPFS에 올라가며, 등록 후에는 바꿀 수
        없습니다. 등록하면 NFT가 에스크로 컨트랙트에 보관됩니다. MetaMask 요청은 최대 3번입니다 (업로드 확인 서명, NFT 사용
        승인, 판매 등록). 구매 전에는 언제든 등록을 취소할 수 있습니다.
      </p>
      <SubmitButton disabled={tx.busy}>{tx.busy ? "처리 중…" : "판매 등록"}</SubmitButton>
      <TxStatus state={tx} />
    </form>
  );
}

function priceHint(rule: ListingPriceRule, token: Token, sellerIsArtist: boolean): string {
  const prefix = sellerIsArtist ? "아티스트 재판매는 일반 재판매와 같은 정책이 적용됩니다 (D10). " : "";
  if (rule.kind === "cap") {
    return `${prefix}재판매 상한 ${formatEth(rule.cap)} (최초 판매가 × ${formatBps(token.policyBps)}) 이하`;
  }
  if (token.policy === "Royalty") {
    return sellerIsArtist
      ? `${prefix}가격 제한 없음, 판매자가 아티스트 본인이므로 로열티는 0으로 기록됩니다.`
      : `가격 제한 없음. 거래 완료 시 판매 금액의 ${formatBps(token.policyBps)}가 아티스트 로열티로 정산됩니다.`;
  }
  return `${prefix}가격 제한·로열티 없음`;
}

function Notice({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">{children}</p>;
}
