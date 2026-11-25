import Link from "next/link";
import { ListingStatusBadge } from "@/components/listing/ListingStatusBadge";
import { formatEth } from "@/lib/domain/format";
import type { ListingStatus, ListingWithToken } from "@/lib/domain/types";

type Role = "seller" | "buyer";

/** 내가 해야 할 일 안내 (버튼은 거래 상세 화면에 있다) */
const TODO: Record<Role, Partial<Record<ListingStatus, string>>> = {
  seller: { LISTED: "구매 대기", LOCKED: "실물 배송 · 기한 후 정산 청구 가능" },
  buyer: { LOCKED: "수령 후 승인 필요" },
};

/** 판매 또는 구매 거래 목록 */
export function MyListingsTable({ items, role }: { items: ListingWithToken[]; role: Role }) {
  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">{role === "seller" ? "판매" : "구매"} 거래가 없습니다.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <thead className="text-zinc-500">
          <tr className="border-b border-zinc-200 dark:border-zinc-800">
            <th className="py-2 pr-4 font-normal">거래</th>
            <th className="py-2 pr-4 font-normal">NFT</th>
            <th className="py-2 pr-4 font-normal">구분</th>
            <th className="py-2 pr-4 font-normal">가격</th>
            <th className="py-2 pr-4 font-normal">상태</th>
            <th className="py-2 font-normal">할 일</th>
          </tr>
        </thead>
        <tbody>
          {items.map(({ listing }) => (
            <tr key={listing.listingId} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="py-2 pr-4">
                <Link href={`/listings/${listing.listingId}`} className="underline underline-offset-2">
                  #{listing.listingId}
                </Link>
              </td>
              <td className="py-2 pr-4">
                <Link href={`/tokens/${listing.tokenId}`} className="underline underline-offset-2">
                  #{listing.tokenId}
                </Link>
              </td>
              <td className="py-2 pr-4">{listing.isPrimary ? "최초 판매" : "재판매"}</td>
              <td className="py-2 pr-4">{formatEth(listing.price)}</td>
              <td className="py-2 pr-4">
                <ListingStatusBadge status={listing.status} />
              </td>
              <td className="py-2 text-zinc-500">{TODO[role][listing.status] ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
