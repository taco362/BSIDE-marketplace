"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { TxButton } from "@/components/tx/TxButton";
import { NetworkGuard } from "@/components/wallet/NetworkGuard";
import { useNow } from "@/hooks/useNow";
import { formatEth, formatTimestamp, isSameAddress } from "@/lib/domain/format";
import type { Listing } from "@/lib/domain/types";
import { buy, cancelListing, claimAfterTimeout, confirmReceipt, refundBySeller } from "@/lib/tx/escrow";
import { DisputeForm } from "./DisputeForm";

/**
 * 거래 상세의 상태·역할별 거래 버튼 (architecture.md 4.3)
 * - LISTED: 판매자 → 등록 취소 / 그 외 → 구매
 * - LOCKED: 구매자 → 수령 승인, 기한 전 분쟁 제기 (D5, 사유 기록 D15) / 판매자 → 기한 경과 후 정산 청구, 전액 환불 (D4)
 * - DISPUTED: 안내만 (중재는 /admin, 관리자)
 * 버튼 노출은 안내용이며 최종 검증은 컨트랙트가 한다.
 */
export function ListingActions({ listing }: { listing: Listing }) {
  if (listing.status === "COMPLETED" || listing.status === "CANCELLED") {
    return (
      <Note>
        종료된 거래입니다. 정산·환불 금액은{" "}
        <Link href="/my" className="underline underline-offset-2">
          내 거래
        </Link>
        에서 출금할 수 있습니다.
      </Note>
    );
  }
  if (listing.status === "DISPUTED") {
    return (
      <Note>
        구매자가 분쟁을 제기해 관리자 중재를 기다리는 거래입니다. 자동 정산과 판매자 환불이 보류되며, 관리자가 구매자
        환불 또는 판매자 정산 중 하나로 처리합니다.
      </Note>
    );
  }
  // 상태·계정이 바뀌면 버튼 영역을 새로 그린다. 같은 위치의 TxButton이 재사용되면
  // 이전 동작(예: 구매)의 진행·완료 표시가 다음 동작(수령 승인) 버튼에 남기 때문이다.
  return (
    <NetworkGuard>
      {(account) => <Actions key={`${listing.status}:${account.toLowerCase()}`} listing={listing} account={account} />}
    </NetworkGuard>
  );
}

function Actions({ listing, account }: { listing: Listing; account: string }) {
  const isSeller = isSameAddress(account, listing.seller);
  const isBuyer = isSameAddress(account, listing.buyer);
  const id = listing.listingId;

  if (listing.status === "LISTED") {
    if (isSeller) {
      return (
        <TxButton
          label="판매 등록 취소"
          variant="secondary"
          confirmMessage="판매 등록을 취소할까요? NFT가 판매자 지갑으로 돌아옵니다."
          steps={[{ label: "판매 등록 취소", send: (s) => cancelListing(s, id) }]}
        />
      );
    }
    return (
      <div className="flex flex-col gap-2">
        <TxButton
          label={`${formatEth(listing.price)}로 구매`}
          confirmMessage={`${formatEth(listing.price)}를 에스크로에 예치하고 구매할까요?\n대금은 수령 승인(또는 기한 경과 후 판매자 정산 청구) 시 판매자에게 정산됩니다.`}
          steps={[{ label: "구매 (대금 예치)", send: (s) => buy(s, id, listing.price) }]}
        />
        <p className="text-xs text-zinc-500">가스비가 별도로 필요합니다.</p>
      </div>
    );
  }

  // LOCKED
  if (isBuyer) return <BuyerLockedActions listing={listing} />;
  if (isSeller) {
    return (
      <div className="flex flex-col gap-6">
        <ClaimAction listing={listing} />
        <RefundAction listingId={id} />
      </div>
    );
  }
  return <Note>다른 구매자가 구매한 거래입니다.</Note>;
}

/** 구매자: 수령 승인, 기한 전 분쟁 제기 (D5·D15). 기한이 지나면 분쟁 버튼을 비활성화한다. */
function BuyerLockedActions({ listing }: { listing: Listing }) {
  const now = useNow();
  const deadline = listing.deadline;
  // 시각을 모르는 동안(hydration 직후)은 비활성. 판정 기준은 블록 시각이며 최종 판정은 컨트랙트가 한다
  const canDispute = now !== null && deadline !== null && now < deadline;
  const [disputeOpen, setDisputeOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <TxButton
          label="수령 승인"
          confirmMessage={
            "실물 상품을 받았고 상태를 확인했나요?\n승인하면 대금이 정산되고 NFT가 내 지갑으로 이전됩니다. 되돌릴 수 없습니다."
          }
          steps={[{ label: "수령 승인", send: (s) => confirmReceipt(s, listing.listingId) }]}
        />
        {deadline !== null && (
          <p className="text-xs text-zinc-500">
            수령 승인 기한 {formatTimestamp(deadline)}. 기한이 지나면 판매자가 정산을 청구할 수 있습니다.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {disputeOpen && canDispute ? (
          <DisputeForm listingId={listing.listingId} onCancel={() => setDisputeOpen(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setDisputeOpen(true)}
            disabled={!canDispute}
            className="self-start rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            분쟁 제기
          </button>
        )}
        <p className="text-xs text-zinc-500">
          {deadline !== null && now !== null && !canDispute
            ? "수령 승인 기한이 지나 분쟁을 제기할 수 없습니다."
            : "상품에 문제가 있으면 수령 승인 기한 안에 분쟁을 제기할 수 있습니다."}
        </p>
      </div>
    </div>
  );
}

/** 판매자: 구매자에게 전액 환불하고 NFT를 돌려받는다 (D4). 기한과 무관 */
function RefundAction({ listingId }: { listingId: number }) {
  return (
    <div className="flex flex-col gap-2">
      <TxButton
        label="구매자에게 전액 환불"
        variant="secondary"
        confirmMessage={
          "구매자에게 대금 전액을 환불하고 거래를 취소할까요?\n환불액은 구매자 출금 대기액에 적립되고 NFT는 내 지갑으로 돌아옵니다. 되돌릴 수 없습니다."
        }
        steps={[{ label: "판매자 환불", send: (s) => refundBySeller(s, listingId) }]}
      />
      <p className="text-xs text-zinc-500">상품을 보낼 수 없으면 환불로 거래를 취소할 수 있습니다.</p>
    </div>
  );
}

/** 판매자: 수령 승인 기한이 지나면 정산 청구 (D2). 기한 전에는 버튼을 비활성화한다. */
function ClaimAction({ listing }: { listing: Listing }) {
  const now = useNow();
  const deadline = listing.deadline;
  const reached = now !== null && deadline !== null && now >= deadline;

  return (
    <div className="flex flex-col gap-2">
      <TxButton
        label="정산 청구"
        disabled={!reached}
        confirmMessage="구매자가 기한 안에 수령 승인이나 이의 제기를 하지 않았습니다. 정산을 청구할까요?"
        steps={[{ label: "기한 경과 정산 청구", send: (s) => claimAfterTimeout(s, listing.listingId) }]}
      />
      <p className="text-xs text-zinc-500">
        {deadline === null
          ? "구매자의 수령 승인을 기다리는 중입니다."
          : reached
            ? `수령 승인 기한(${formatTimestamp(deadline)})이 지났습니다. 정산을 청구할 수 있습니다.`
            : `구매자의 수령 승인을 기다리는 중입니다. 기한 ${formatTimestamp(deadline)} 이후 정산을 청구할 수 있습니다.`}
      </p>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-sm text-zinc-500">{children}</p>;
}
