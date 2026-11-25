"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { TxStatus } from "@/components/tx/TxStatus";
import { FormField, INPUT_CLASS, SubmitButton } from "@/components/ui/FormField";
import { NetworkGuard } from "@/components/wallet/NetworkGuard";
import { useTx } from "@/hooks/useTx";
import { formatEth, isSameAddress, parseEth } from "@/lib/domain/format";
import { checkListingPrice, formatBps, listingPriceRule, type ListingPriceRule } from "@/lib/domain/policy";
import type { Token } from "@/lib/domain/types";
import { checkConditionCid } from "@/lib/domain/validation";
import { list, listedListingId } from "@/lib/tx/escrow";
import { approveEscrowIfNeeded } from "@/lib/tx/nft";

/**
 * 판매 등록: NFT 사용 승인(approve) → 판매 등록(list) 순서로 서명한다 (architecture.md 6.2).
 * 가격 규칙은 연결된 계정(판매자) 기준으로 미리 안내하고, 최종 검증은 컨트랙트가 한다.
 */
export function SellForm({ token }: { token: Token }) {
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
  onListed,
}: {
  token: Token;
  rule: ListingPriceRule;
  sellerIsArtist: boolean;
  onListed: (listingId: number) => void;
}) {
  const tx = useTx();
  const [priceText, setPriceText] = useState("");
  const [cidText, setCidText] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const price = rule.kind === "primary" ? rule.price : parseEth(priceText);
  const cid = cidText.trim();
  const priceError =
    price === null ? "ETH 금액을 숫자로 입력하세요 (예: 0.05)." : checkListingPrice(rule, price);
  const cidError = checkConditionCid(cid);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (priceError || cidError || price === null) return;
    const receipts = await tx.run([
      { label: "NFT 사용 승인 (에스크로)", send: (s) => approveEscrowIfNeeded(s, token.tokenId) },
      { label: "판매 등록", send: (s) => list(s, token.tokenId, price, cid) },
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

      <FormField
        label="상품 상태 기록 CID"
        htmlFor="condition-cid"
        hint="Pinata에 업로드한 상품 상태 기록 JSON의 CID (ipfs:// 없이). 등록 후에는 바꿀 수 없습니다."
        error={submitted ? cidError : null}
      >
        <input
          id="condition-cid"
          value={cidText}
          onChange={(e) => setCidText(e.target.value)}
          placeholder="bafk…"
          autoComplete="off"
          className={`${INPUT_CLASS} font-mono`}
        />
      </FormField>

      <p className="text-xs text-zinc-500">
        등록하면 NFT가 에스크로 컨트랙트에 보관됩니다. MetaMask 서명이 최대 2번 필요합니다 (NFT 사용 승인, 판매 등록).
        구매 전에는 언제든 등록을 취소할 수 있습니다.
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
