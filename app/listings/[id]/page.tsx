import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListingStatusBadge } from "@/components/listing/ListingStatusBadge";
import { TokenSummary } from "@/components/token/TokenSummary";
import { ConditionHistoryWarnings } from "@/components/condition/ConditionHistoryWarnings";
import { ConditionRecordFallback, ConditionRecordView } from "@/components/condition/ConditionRecordView";
import { getMarketReader } from "@/lib/data";
import { getConditionRecord, getPriorConditions } from "@/lib/data/ipfs/conditionRecords";
import { formatEth } from "@/lib/domain/format";
import { ListingActions } from "./_components/ListingActions";
import { ListingInfo } from "./_components/ListingInfo";

/** 거래 상세: 현재 상태와 상태·역할별 거래 버튼 */
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
  const conditionRecord = getConditionRecord(listing.conditionCID);
  // 모순 경고(6.7 A1)의 비교 대상. 기다리지 않고 넘긴다 (경고는 <Suspense> 안에서 따로 표시)
  const priorConditions = reader
    .getListingsByToken(token.tokenId)
    .then((listings) => getPriorConditions(listings, listing.listingId))
    .catch(() => []);
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
        <h2 className="text-lg font-semibold">거래하기</h2>
        <div className="max-w-xl empty:hidden">
          <Suspense fallback={null}>
            <ConditionHistoryWarnings record={conditionRecord} prior={priorConditions} />
          </Suspense>
        </div>
        <ListingActions listing={listing} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">거래 정보</h2>
        <ListingInfo listing={listing} artist={token.artist} accounts={accounts} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">상품 상태 기록</h2>
        <p className="text-sm text-zinc-500">판매자가 이 판매를 등록할 때 남긴 기록이며, 등록 후에는 바뀌지 않습니다.</p>
        <div className="max-w-xl">
          <Suspense fallback={<ConditionRecordFallback />}>
            <ConditionRecordView cid={listing.conditionCID} result={conditionRecord} listing={listing} />
          </Suspense>
        </div>
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
