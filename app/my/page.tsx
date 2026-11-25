import { Suspense } from "react";
import { getMarketReader } from "@/lib/data";
import { AccountSync } from "./_components/AccountSync";
import { MyListingsTable } from "./_components/MyListingsTable";
import { MyTokenList } from "./_components/MyTokenList";
import { WithdrawPanel } from "./_components/WithdrawPanel";

/**
 * 내 거래: 출금, 보유 NFT(판매 등록 진입), 판매·구매 거래
 * 서버는 연결된 지갑을 알 수 없으므로, 연결된 계정을 ?account= 로 넘겨 서버에서 조회한다 (AccountSync).
 */
export default function MyPage({ searchParams }: PageProps<"/my">) {
  return (
    <main className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">내 거래</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">불러오는 중…</p>}>
        <MyContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function MyContent({ searchParams }: Pick<PageProps<"/my">, "searchParams">) {
  const raw = (await searchParams).account;
  const account = typeof raw === "string" && /^0x[0-9a-fA-F]{40}$/.test(raw) ? raw : null;
  if (!account) return <AccountSync current={null} />;

  const reader = getMarketReader();
  const [tokens, { selling, buying }, pending] = await Promise.all([
    reader.getTokensByOwner(account),
    reader.getListingsByAccount(account),
    reader.getPendingWithdrawal(account),
  ]);

  return (
    <>
      <AccountSync current={account} />
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">출금</h2>
        <WithdrawPanel account={account} pending={pending} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">보유 NFT</h2>
        <MyTokenList tokens={tokens} account={account} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">판매 거래</h2>
        <MyListingsTable items={selling} role="seller" />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">구매 거래</h2>
        <MyListingsTable items={buying} role="buyer" />
      </section>
    </>
  );
}
