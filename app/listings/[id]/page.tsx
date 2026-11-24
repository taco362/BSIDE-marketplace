import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListingStatusBadge } from "@/components/listing/ListingStatusBadge";
import { TokenSummary } from "@/components/token/TokenSummary";
import { getMarketReader } from "@/lib/data";
import { formatEth } from "@/lib/domain/format";
import { ListingInfo } from "./_components/ListingInfo";

/** 거래 상세. 구매·승인 등 거래 버튼은 6단계에서 추가한다. */
export default function ListingPage({ params }: PageProps<"/listings/[id]">) {
  return (
    <main>
      <Suspense fallback={<p className="text-sm text-zinc-500">불러오는 중…</p>}>
        <ListingDetail params={params} />
      </Suspense>
    </main>
  );
}

async function ListingDetail({ params }: Pick<PageProps<"/listings/[id]">, "params">) {
  const { id } = await params;
  const reader = getMarketReader();
  const item = /^[1-9][0-9]*$/.test(id) ? await reader.getListing(Number(id)) : null;
  if (!item) notFound();
  const { listing, token } = item;
  const accounts = await reader.getAccounts([
    token.artist,
    listing.seller,
    listing.buyer,
    token.inEscrow ? null : token.owner,
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-zinc-500">거래 #{listing.listingId}</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{formatEth(listing.price)}</h1>
          <ListingStatusBadge status={listing.status} />
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">거래 정보</h2>
        <ListingInfo listing={listing} artist={token.artist} accounts={accounts} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">NFT 정보</h2>
          <Link href={`/tokens/${token.tokenId}`} className="text-sm underline underline-offset-2">
            거래 이력 보기
          </Link>
        </div>
        <TokenSummary token={token} accounts={accounts} />
      </section>
    </div>
  );
}
