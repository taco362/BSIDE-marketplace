import { Suspense } from "react";
import { getMarketReader } from "@/lib/data";
import { getTokenName } from "@/lib/data/ipfs/tokenMetadata";
import { ListingCard } from "./_components/ListingCard";

/** 판매 중 상품 목록 */
export default function Home() {
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">판매 중인 상품</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">불러오는 중…</p>}>
        <ActiveListings />
      </Suspense>
    </main>
  );
}

async function ActiveListings() {
  const reader = getMarketReader();
  const items = await reader.getActiveListings();

  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">판매 중인 상품이 없습니다.</p>;
  }
  const accounts = await reader.getAccounts(items.flatMap((i) => [i.token.artist, i.listing.seller]));

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <li key={item.listing.listingId}>
          {/* 상품 이름은 기다리지 않고 넘긴다. 카드마다 따로 표시되어 게이트웨이가 느려도 목록은 먼저 보인다 */}
          <ListingCard item={item} name={getTokenName(item.token.tokenURI)} accounts={accounts} />
        </li>
      ))}
    </ul>
  );
}
