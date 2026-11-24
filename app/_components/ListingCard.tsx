import Link from "next/link";
import { AccountLabel } from "@/components/account/AccountLabel";
import { PolicyBadge } from "@/components/token/PolicyBadge";
import { accountOf } from "@/lib/domain/account";
import { formatEth, isSameAddress } from "@/lib/domain/format";
import type { AccountDirectory, ListingWithToken } from "@/lib/domain/types";

/** 판매 목록 카드: 아티스트(발행자)와 판매자(현재 등록자)를 나누어 표시 */
export function ListingCard({
  item: { listing, token },
  accounts,
}: {
  item: ListingWithToken;
  accounts: AccountDirectory;
}) {
  const sellerIsArtist = isSameAddress(listing.seller, token.artist);

  return (
    <Link
      href={`/listings/${listing.listingId}`}
      className="flex h-full flex-col gap-3 rounded-xl border border-zinc-200 p-4 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
    >
      <div className="flex items-center justify-between text-sm text-zinc-500">
        <span>토큰 #{token.tokenId}</span>
        <span>거래 #{listing.listingId}</span>
      </div>
      <p className="text-xl font-semibold">{formatEth(listing.price)}</p>
      <div className="flex flex-wrap items-center gap-2">
        <PolicyBadge policy={token.policy} policyBps={token.policyBps} />
        {listing.isPrimary && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            최초 판매
          </span>
        )}
      </div>
      <dl className="mt-auto grid grid-cols-[3.5rem_1fr] gap-x-2 gap-y-1 text-sm">
        <dt className="text-zinc-500">아티스트</dt>
        <dd className="min-w-0">
          <AccountLabel account={accountOf(accounts, token.artist)} />
        </dd>
        <dt className="text-zinc-500">판매자</dt>
        <dd className="min-w-0">
          {sellerIsArtist ? "아티스트 본인" : <AccountLabel account={accountOf(accounts, listing.seller)} />}
        </dd>
      </dl>
    </Link>
  );
}
