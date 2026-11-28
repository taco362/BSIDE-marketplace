import { Suspense } from "react";
import { RoleGate } from "@/components/wallet/RoleGate";
import { getMarketReader } from "@/lib/data";
import { ArtistTable } from "./_components/ArtistTable";
import { DisputeTable } from "./_components/DisputeTable";
import { RegisterArtistForm } from "./_components/RegisterArtistForm";

/** 관리자: 분쟁 중재 (D5), 아티스트 등록(활동명 포함)·승인 회수 (D7) */
export default function AdminPage() {
  return (
    <main className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">관리자</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">불러오는 중…</p>}>
        <AdminContent />
      </Suspense>
    </main>
  );
}

async function AdminContent() {
  const reader = getMarketReader();
  const [admin, artists, disputes] = await Promise.all([
    reader.getAdmin(),
    reader.getArtists(),
    reader.getDisputedListings(),
  ]);
  const accounts = await reader.getAccounts(disputes.flatMap((d) => [d.listing.seller, d.listing.buyer]));

  // 관리자 지갑이 연결됐을 때만 내용을 보인다 (화면 표시용, 관리 권한은 컨트랙트가 확인)
  return (
    <RoleGate allowed={[admin]} deniedMessage="관리자 화면은 관리자 지갑으로만 이용할 수 있습니다.">
      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">분쟁 중재 {disputes.length > 0 && `(${disputes.length}건)`}</h2>
          <p className="text-sm text-zinc-500">
            구매자 환불 또는 판매자 정산 중 하나만 선택할 수 있습니다. 처리하기 전에 거래 상세에서 상품 상태 기록을 확인하세요.
          </p>
          <DisputeTable disputes={disputes} accounts={accounts} />
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">아티스트 등록 · 활동명 변경</h2>
          <RegisterArtistForm />
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">등록된 아티스트</h2>
          <ArtistTable artists={artists} />
        </section>
      </div>
    </RoleGate>
  );
}
