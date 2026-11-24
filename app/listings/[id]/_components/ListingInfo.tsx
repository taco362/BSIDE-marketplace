import { AccountLabel } from "@/components/account/AccountLabel";
import { DetailItem, DetailList } from "@/components/ui/DetailList";
import { IpfsLink } from "@/components/ui/IpfsLink";
import { accountOf } from "@/lib/domain/account";
import { formatTimestamp, isSameAddress } from "@/lib/domain/format";
import type { AccountDirectory, Listing } from "@/lib/domain/types";

/** 거래 정보: 구분, 당사자, 상태 기록, 시각 */
export function ListingInfo({
  listing,
  artist,
  accounts,
}: {
  listing: Listing;
  /** 이 NFT의 발행 아티스트 주소 (판매자가 아티스트 본인인지 표시용) */
  artist: string;
  accounts: AccountDirectory;
}) {
  return (
    <DetailList>
      <DetailItem label="구분">{listing.isPrimary ? "최초 판매 (최초 판매가 고정)" : "재판매"}</DetailItem>
      <DetailItem label="판매자">
        <AccountLabel
          account={accountOf(accounts, listing.seller)}
          full
          note={isSameAddress(listing.seller, artist) ? "아티스트 본인" : undefined}
        />
      </DetailItem>
      <DetailItem label="구매자">
        {listing.buyer ? <AccountLabel account={accountOf(accounts, listing.buyer)} full /> : "—"}
      </DetailItem>
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
