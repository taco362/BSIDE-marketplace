import { Address } from "@/components/ui/Address";
import { DetailItem, DetailList } from "@/components/ui/DetailList";
import { IpfsLink } from "@/components/ui/IpfsLink";
import { formatTimestamp } from "@/lib/domain/format";
import type { Listing } from "@/lib/domain/types";

/** 거래 정보: 구분, 당사자, 상태 기록, 시각 */
export function ListingInfo({ listing }: { listing: Listing }) {
  return (
    <DetailList>
      <DetailItem label="구분">{listing.isPrimary ? "최초 판매 (최초 판매가 고정)" : "재판매"}</DetailItem>
      <DetailItem label="판매자">
        <Address address={listing.seller} />
      </DetailItem>
      <DetailItem label="구매자">{listing.buyer ? <Address address={listing.buyer} /> : "—"}</DetailItem>
      <DetailItem label="상품 상태 기록">
        <IpfsLink uri={listing.conditionCID} />
      </DetailItem>
      <DetailItem label="판매 등록">{formatTimestamp(listing.listedAt)}</DetailItem>
      {listing.lockedAt !== null && <DetailItem label="구매(대금 예치)">{formatTimestamp(listing.lockedAt)}</DetailItem>}
      {listing.deadline !== null && listing.status === "LOCKED" && (
        <DetailItem label="수령 승인 기한">
          {formatTimestamp(listing.deadline)} <span className="text-zinc-500">(기한 후 판매자 정산 청구 가능)</span>
        </DetailItem>
      )}
      {listing.closedAt !== null && <DetailItem label="종료">{formatTimestamp(listing.closedAt)}</DetailItem>}
    </DetailList>
  );
}
