import { Suspense } from "react";
import { getMarketReader } from "@/lib/data";
import { ArtistTable } from "./_components/ArtistTable";
import { RegisterArtistForm } from "./_components/RegisterArtistForm";

/** 관리자: 아티스트 등록(활동명 포함)·승인 회수 (D7). 분쟁 중재 화면은 Phase 2 */
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
  const [admin, artists] = await Promise.all([reader.getAdmin(), reader.getArtists()]);

  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">아티스트 등록 · 활동명 변경</h2>
        <RegisterArtistForm admin={admin} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">등록된 아티스트</h2>
        <ArtistTable artists={artists} />
      </section>
    </>
  );
}
