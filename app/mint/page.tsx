import { Suspense } from "react";
import { getMarketReader } from "@/lib/data";
import { MintForm } from "./_components/MintForm";

/** 아티스트 NFT 발행 (FR-01, 흐름 A 1~4) */
export default function MintPage() {
  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">NFT 발행</h1>
        <p className="text-sm text-zinc-500">
          관리자가 승인한 아티스트만 발행할 수 있습니다. 최초 판매가와 재판매 정책은 발행 후 바꿀 수 없습니다.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-500">불러오는 중…</p>}>
        <MintContent />
      </Suspense>
    </main>
  );
}

async function MintContent() {
  const artists = await getMarketReader().getArtists();
  return <MintForm verifiedArtists={artists.filter((a) => a.verifiedArtist).map((a) => a.address)} />;
}
