"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { TxStatus } from "@/components/tx/TxStatus";
import { FormField, INPUT_CLASS, SubmitButton } from "@/components/ui/FormField";
import { NetworkGuard } from "@/components/wallet/NetworkGuard";
import { useTx } from "@/hooks/useTx";
import { formatEth, isSameAddress, parseEth } from "@/lib/domain/format";
import { POLICY_BPS_RANGE, POLICY_LABELS, describePolicy, formatBps, percentToBps } from "@/lib/domain/policy";
import { POLICIES, type Policy } from "@/lib/domain/types";
import { checkMetadataUri, checkPolicyBps } from "@/lib/domain/validation";
import { mint, mintedTokenId } from "@/lib/tx/nft";

const POLICY_HINTS: Record<Policy, string> = {
  PriceCap: "재판매 가격 상한을 최초 판매가의 일정 비율로 제한합니다.",
  Royalty: "재판매 가격 제한 없이, 거래 완료 시 판매 금액의 일정 비율을 아티스트에게 지급합니다.",
  Free: "재판매 가격 제한과 의무 로열티가 없습니다.",
};

/** 발행 폼. 연결된 계정에게 발행된다. */
export function MintForm({ verifiedArtists }: { verifiedArtists: string[] }) {
  return (
    <NetworkGuard>
      {(account) => (
        <div className="flex flex-col gap-4">
          {!verifiedArtists.some((a) => isSameAddress(a, account)) && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              연결된 계정은 승인된 아티스트 목록에 없습니다. 관리자에게 아티스트 등록을 요청하세요. 승인되지 않은 계정의
              발행은 컨트랙트가 거부합니다.
            </p>
          )}
          <Form />
        </div>
      )}
    </NetworkGuard>
  );
}

function Form() {
  const tx = useTx();
  const [metadataUri, setMetadataUri] = useState("");
  const [priceText, setPriceText] = useState("");
  const [policy, setPolicy] = useState<Policy>("PriceCap");
  const [percentText, setPercentText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [tokenId, setTokenId] = useState<number | null>(null);

  const uri = metadataUri.trim();
  const price = parseEth(priceText);
  const bps = policy === "Free" ? 0 : percentToBps(percentText);
  const errors = {
    uri: checkMetadataUri(uri),
    price: price === null || price <= BigInt(0) ? "0보다 큰 ETH 금액을 입력하세요 (예: 0.05)." : null,
    bps: checkPolicyBps(policy, bps),
  };
  const range = POLICY_BPS_RANGE[policy];

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (errors.uri || errors.price || errors.bps || price === null || bps === null) return;
    const summary = `최초 판매가 ${formatEth(price)}, ${POLICY_LABELS[policy]} (${describePolicy(policy, bps)})`;
    if (!window.confirm(`${summary}\n\n발행 후에는 최초 판매가·정책·메타데이터를 바꿀 수 없습니다. 발행할까요?`)) return;

    setTokenId(null);
    const input = { metadataUri: uri, initialPrice: price, policy, policyBps: bps };
    const receipts = await tx.run([{ label: "NFT 발행", send: (s) => mint(s, input) }]);
    if (receipts?.[0]) setTokenId(mintedTokenId(receipts[0]));
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-5">
      <FormField
        label="메타데이터 URI"
        htmlFor="metadata-uri"
        hint="Pinata에 업로드한 메타데이터 JSON(name, description, image)의 CID. 가짜·임시 CID로 발행하지 마세요."
        error={submitted ? errors.uri : null}
      >
        <input
          id="metadata-uri"
          value={metadataUri}
          onChange={(e) => setMetadataUri(e.target.value)}
          placeholder="ipfs://bafk…"
          autoComplete="off"
          className={`${INPUT_CLASS} font-mono`}
        />
      </FormField>

      <FormField
        label="최초 판매가 (ETH)"
        htmlFor="initial-price"
        hint="최초 판매는 이 가격으로 고정됩니다 (D1)."
        error={submitted ? errors.price : null}
      >
        <input
          id="initial-price"
          value={priceText}
          onChange={(e) => setPriceText(e.target.value)}
          inputMode="decimal"
          placeholder="0.05"
          autoComplete="off"
          className={INPUT_CLASS}
        />
      </FormField>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">재판매 정책</legend>
        {POLICIES.map((p) => (
          <label key={p} className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="radio"
              name="policy"
              value={p}
              checked={policy === p}
              onChange={() => setPolicy(p)}
              className="mt-1"
            />
            <span>
              <span className="font-medium">{POLICY_LABELS[p]}</span>
              <span className="block text-xs text-zinc-500">{POLICY_HINTS[p]}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {policy !== "Free" && (
        <FormField
          label={policy === "PriceCap" ? "재판매 상한 (최초 판매가 대비 %)" : "로열티 (재판매 금액 대비 %)"}
          htmlFor="policy-percent"
          hint={`${formatBps(range.min)} ~ ${formatBps(range.max)}, 소수 둘째 자리까지`}
          error={submitted ? errors.bps : null}
        >
          <input
            id="policy-percent"
            value={percentText}
            onChange={(e) => setPercentText(e.target.value)}
            inputMode="decimal"
            placeholder={policy === "PriceCap" ? "120" : "5"}
            autoComplete="off"
            className={INPUT_CLASS}
          />
        </FormField>
      )}

      <SubmitButton disabled={tx.busy}>{tx.busy ? "처리 중…" : "발행"}</SubmitButton>
      <TxStatus
        state={tx}
        successMessage={
          tokenId === null ? (
            "발행했습니다."
          ) : (
            <span className="flex flex-wrap gap-x-3">
              <span>NFT #{tokenId}을(를) 발행했습니다.</span>
              <Link href={`/sell/${tokenId}`} className="underline underline-offset-2">
                최초 판매 등록하기
              </Link>
              <Link href={`/tokens/${tokenId}`} className="underline underline-offset-2">
                NFT 정보 보기
              </Link>
            </span>
          )
        }
      />
    </form>
  );
}
