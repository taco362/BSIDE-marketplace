import { Suspense } from "react";
import { getMarketReader } from "@/lib/data";
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
  const items = await getMarketReader().getActiveListings();

  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">판매 중인 상품이 없습니다.</p>;
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <li key={item.listing.listingId}>
          <ListingCard item={item} />
        </li>
      ))}
    </ul>
  );
}
