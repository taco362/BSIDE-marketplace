import { Suspense } from "react";
import { notFound } from "next/navigation";
import { TokenSummary } from "@/components/token/TokenSummary";
import { getMarketReader } from "@/lib/data";
import { getPriorConditions } from "@/lib/data/ipfs/conditionRecords";
import { SellForm } from "./_components/SellForm";

/** 판매 등록 (FR-03·FR-05, 흐름 A 5 / 흐름 B 2~5). NFT 선택은 내 거래(/my)의 보유 NFT 목록에서 한다. */
export default function SellPage({ params }: PageProps<"/sell/[tokenId]">) {
  return (
    <main>
      <Suspense fallback={<p className="text-sm text-zinc-500">불러오는 중…</p>}>
        <SellContent params={params} />
      </Suspense>
    </main>
  );
}

async function SellContent({ params }: Pick<PageProps<"/sell/[tokenId]">, "params">) {
  const { tokenId: raw } = await params;
  if (!/^[1-9][0-9]*$/.test(raw)) notFound();
  const reader = getMarketReader();
  const token = await reader.getToken(Number(raw));
  if (!token) notFound();
  // 판매자 모순 안내(6.7 A1)의 비교 대상: 지금까지 완료된 모든 거래. 기다리지 않고 넘긴다 (실패하면 안내 없음)
  const priorConditions = reader
    .getListingsByToken(token.tokenId)
    .then((listings) => getPriorConditions(listings, Number.POSITIVE_INFINITY))
    .catch(() => []);
  const accounts = await reader.getAccounts([token.artist, token.inEscrow ? null : token.owner]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">NFT #{token.tokenId} 판매 등록</h1>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">NFT 정보</h2>
        <TokenSummary token={token} accounts={accounts} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">판매 정보</h2>
        <SellForm token={token} priorConditions={priorConditions} />
      </section>
    </div>
  );
}
