import { Suspense } from "react";
import Link from "next/link";
import { AccountLabel } from "@/components/account/AccountLabel";
import { ListingTitle, ListingTitleText, fallbackTitle } from "@/components/listing/ListingTitle";
import { getTokenName } from "@/lib/data/ipfs/tokenMetadata";
import { accountOf } from "@/lib/domain/account";
import { formatEth, formatTimestamp } from "@/lib/domain/format";
import type { AccountDirectory, ListingWithToken } from "@/lib/domain/types";
import { ResolveDisputeButtons } from "./ResolveDisputeButtons";

/**
 * 분쟁 중인 거래 목록과 중재 버튼 (D5, architecture.md 6.2)
 * 상품 상태 기록·사진은 거래 상세에서 확인한다. 분쟁 사유는 저장하지 않는다(오프체인, 8.3).
 */
export function DisputeTable({ disputes, accounts }: { disputes: ListingWithToken[]; accounts: AccountDirectory }) {
  if (disputes.length === 0) {
    return <p className="text-sm text-zinc-500">처리할 분쟁이 없습니다.</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
      {disputes.map(({ listing, token }) => (
        <li key={listing.listingId} className="flex flex-col gap-3 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="min-w-0">
              <Suspense fallback={<ListingTitleText text={fallbackTitle(token.tokenId)} />}>
                <ListingTitle tokenId={token.tokenId} name={getTokenName(token.tokenURI)} />
              </Suspense>
              <Link
                href={`/listings/${listing.listingId}`}
                className="text-sm text-zinc-500 underline underline-offset-2"
              >
                거래 #{listing.listingId} 상세 · 상품 상태 기록 보기
              </Link>
            </div>
            <p className="font-semibold">{formatEth(listing.price)}</p>
          </div>
          <dl className="grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1 text-sm">
            <dt className="text-zinc-500">판매자</dt>
            <dd className="min-w-0">
              <AccountLabel account={accountOf(accounts, listing.seller)} full />
            </dd>
            <dt className="text-zinc-500">구매자</dt>
            <dd className="min-w-0">
              {listing.buyer ? <AccountLabel account={accountOf(accounts, listing.buyer)} full /> : "-"}
            </dd>
            {listing.lockedAt !== null && (
              <>
                <dt className="text-zinc-500">구매 시각</dt>
                <dd>{formatTimestamp(listing.lockedAt)}</dd>
              </>
            )}
          </dl>
          <ResolveDisputeButtons listingId={listing.listingId} price={listing.price} />
        </li>
      ))}
    </ul>
  );
}
