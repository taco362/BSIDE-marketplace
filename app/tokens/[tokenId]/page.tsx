import { Suspense } from "react";
import { notFound } from "next/navigation";
import { TokenSummary } from "@/components/token/TokenSummary";
import { getMarketReader } from "@/lib/data";
import { tradeEventAddresses } from "@/lib/domain/account";
import { primarySaleState } from "@/lib/domain/policy";
import { TokenListingsTable } from "./_components/TokenListingsTable";
import { TradeTimeline } from "./_components/TradeTimeline";

/** NFT 정보, 재판매 정책, 플랫폼 거래 이력 */
export default function TokenPage({ params }: PageProps<"/tokens/[tokenId]">) {
  return (
    <main>
      <Suspense fallback={<p className="text-sm text-zinc-500">불러오는 중…</p>}>
        <TokenDetail params={params} />
      </Suspense>
    </main>
  );
}

async function TokenDetail({ params }: Pick<PageProps<"/tokens/[tokenId]">, "params">) {
  const { tokenId: raw } = await params;
  if (!/^[1-9][0-9]*$/.test(raw)) notFound();
  const tokenId = Number(raw);

  const reader = getMarketReader();
  const [token, listings, history] = await Promise.all([
    reader.getToken(tokenId),
    reader.getListingsByToken(tokenId),
    reader.getTokenHistory(tokenId),
  ]);
  if (!token) notFound();
  const accounts = await reader.getAccounts([
    token.artist,
    token.inEscrow ? null : token.owner,
    ...tradeEventAddresses(history.events),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">NFT #{token.tokenId}</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">NFT 정보</h2>
        <TokenSummary token={token} accounts={accounts} primarySale={primarySaleState(token, listings)} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">플랫폼 거래</h2>
        <TokenListingsTable listings={listings} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">거래 이력</h2>
        <TradeTimeline history={history} accounts={accounts} />
      </section>
    </div>
  );
}
