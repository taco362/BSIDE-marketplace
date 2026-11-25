import { AccountLabel } from "@/components/account/AccountLabel";
import type { AccountProfile } from "@/lib/domain/types";
import { RevokeArtistButton } from "./RevokeArtistButton";

/** 등록된 아티스트와 현재 승인 상태. 회수된 아티스트는 위 폼으로 다시 등록하면 재승인된다. */
export function ArtistTable({ artists }: { artists: AccountProfile[] }) {
  if (artists.length === 0) {
    return <p className="text-sm text-zinc-500">등록된 아티스트가 없습니다.</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
      {artists.map((artist) => (
        <li key={artist.address} className="flex flex-wrap items-start justify-between gap-3 py-3">
          <AccountLabel account={artist} full />
          {artist.verifiedArtist ? (
            <RevokeArtistButton address={artist.address} name={artist.artistName} />
          ) : (
            <span className="text-sm text-zinc-500">승인 회수됨 (활동명 기록은 유지)</span>
          )}
        </li>
      ))}
    </ul>
  );
}
