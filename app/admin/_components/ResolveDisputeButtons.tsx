"use client";

import { TxButton } from "@/components/tx/TxButton";
import { formatEth } from "@/lib/domain/format";
import { resolveDispute } from "@/lib/tx/escrow";

/**
 * 분쟁 중재 (D5): 두 결과 중 하나만 고를 수 있다. 판단 근거(사진·대화)는 오프체인이며 관리자 신뢰에 기반한다 (architecture.md 8.3)
 * - 구매자 환불: 구매자 전액 환불 적립 + NFT 판매자 반환 → CANCELLED
 * - 판매자 정산: 판매자 정산(로열티 규칙 적용) + NFT 구매자 이전 → COMPLETED
 */
export function ResolveDisputeButtons({ listingId, price }: { listingId: number; price: bigint }) {
  return (
    <div className="flex flex-wrap gap-3">
      <TxButton
        label="구매자 환불"
        variant="secondary"
        confirmMessage={`거래 #${listingId}을(를) 구매자 환불로 처리할까요?\n구매자 출금 대기액에 ${formatEth(price)}가 적립되고 NFT는 판매자에게 돌아갑니다. 되돌릴 수 없습니다.`}
        steps={[{ label: "분쟁 중재: 구매자 환불", send: (s) => resolveDispute(s, listingId, true) }]}
        successMessage="구매자 환불로 처리했습니다."
      />
      <TxButton
        label="판매자 정산"
        variant="secondary"
        confirmMessage={`거래 #${listingId}을(를) 판매자 정산으로 처리할까요?\n판매 대금이 판매자에게 정산되고(재판매 로열티 포함) NFT는 구매자에게 이전됩니다. 되돌릴 수 없습니다.`}
        steps={[{ label: "분쟁 중재: 판매자 정산", send: (s) => resolveDispute(s, listingId, false) }]}
        successMessage="판매자 정산으로 처리했습니다."
      />
    </div>
  );
}
