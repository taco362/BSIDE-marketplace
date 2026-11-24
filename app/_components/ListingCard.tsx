import Link from "next/link";
import { Address } from "@/components/ui/Address";
import { PolicyBadge } from "@/components/token/PolicyBadge";
import { formatEth } from "@/lib/domain/format";
import type { ListingWithToken } from "@/lib/domain/types";

/** 판매 목록 카드 */
export function ListingCard({ item: { listing, token } }: { item: ListingWithToken }) {
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
      <p className="mt-auto text-xs text-zinc-500">
        판매자 <Address address={listing.seller} />
      </p>
    </Link>
  );
}
