"use client";

import { TxButton } from "@/components/tx/TxButton";
import { revokeArtist } from "@/lib/tx/nft";

/** 아티스트 승인 회수 (D7). 이미 발행된 NFT와 정책은 유지된다 (architecture.md 8.3) */
export function RevokeArtistButton({ address, name }: { address: string; name: string | null }) {
  return (
    <TxButton
      label="승인 회수"
      variant="secondary"
      confirmMessage={`${name ?? address}의 아티스트 승인을 회수할까요?\n활동명은 남고 인증 표시만 사라집니다. 이미 발행한 NFT는 그대로입니다.`}
      steps={[{ label: "아티스트 승인 회수", send: (s) => revokeArtist(s, address) }]}
      successMessage="승인을 회수했습니다."
    />
  );
}
