import Link from "next/link";
import { ListingStatusBadge } from "@/components/listing/ListingStatusBadge";
import { formatEth, formatTimestamp } from "@/lib/domain/format";
import type { Listing } from "@/lib/domain/types";

/** 토큰의 플랫폼 거래 목록 (현재 상태 기준) */
export function TokenListingsTable({ listings }: { listings: Listing[] }) {
  if (listings.length === 0) {
    return <p className="text-sm text-zinc-500">플랫폼 거래 기록이 없습니다.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <thead className="text-zinc-500">
          <tr className="border-b border-zinc-200 dark:border-zinc-800">
            <th className="py-2 pr-4 font-normal">거래</th>
            <th className="py-2 pr-4 font-normal">구분</th>
            <th className="py-2 pr-4 font-normal">가격</th>
            <th className="py-2 pr-4 font-normal">상태</th>
            <th className="py-2 font-normal">등록</th>
          </tr>
        </thead>
        <tbody>
          {listings.map((l) => (
            <tr key={l.listingId} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="py-2 pr-4">
                <Link href={`/listings/${l.listingId}`} className="underline underline-offset-2">
                  #{l.listingId}
                </Link>
              </td>
              <td className="py-2 pr-4">{l.isPrimary ? "최초 판매" : "재판매"}</td>
              <td className="py-2 pr-4">{formatEth(l.price)}</td>
              <td className="py-2 pr-4">
                <ListingStatusBadge status={l.status} />
              </td>
              <td className="py-2">{formatTimestamp(l.listedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
