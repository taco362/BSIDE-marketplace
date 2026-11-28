import { Suspense } from "react";
import { getMarketReader } from "@/lib/data";
import { RoleGate } from "@/components/wallet/RoleGate";
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
  // 승인된 아티스트 지갑이 연결됐을 때만 폼을 보인다 (화면 표시용, 발행 권한은 컨트랙트가 확인)
  return (
    <RoleGate
      allowed={artists.filter((a) => a.verifiedArtist).map((a) => a.address)}
      deniedMessage="NFT 발행은 관리자가 승인한 아티스트만 이용할 수 있습니다. 아티스트라면 승인받은 지갑으로 연결하세요."
    >
      <MintForm />
    </RoleGate>
  );
}
