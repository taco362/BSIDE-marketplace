import { CopyButton } from "@/components/ui/CopyButton";
import { shortenAddress } from "@/lib/domain/format";
import type { AccountProfile } from "@/lib/domain/types";

/**
 * 계정 표시 (D7)
 * - 활동명이 등록된 계정: 활동명 (+ 현재 승인된 아티스트면 인증 표시)
 * - 그 외: 축약 주소 (+ 활동명 없이 승인만 된 경우 인증 표시)
 * - 전체 주소: 항상 마우스 오버(title)로 볼 수 있고, full이면 아래 줄에 전체 주소와 복사 버튼을 보여준다.
 *   목록 카드처럼 링크 안에 들어가는 곳은 full을 쓰지 않는다 (버튼 중첩 방지).
 */
export function AccountLabel({
  account,
  full = false,
  note,
}: {
  account: AccountProfile;
  full?: boolean;
  /** 이름 뒤에 붙는 보조 설명 (예: "아티스트 본인") */
  note?: string;
}) {
  return (
    <span className="inline-flex min-w-0 flex-col gap-0.5">
      <span className="inline-flex flex-wrap items-center gap-1.5" title={account.address}>
        {account.artistName ? (
          <span className="font-medium">{account.artistName}</span>
        ) : (
          <span className="font-mono">{shortenAddress(account.address)}</span>
        )}
        {account.verifiedArtist && <VerifiedBadge withText={full} />}
        {note && <span className="text-zinc-500">({note})</span>}
      </span>
      {full && (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span className="break-all font-mono text-xs text-zinc-500">{account.address}</span>
          <CopyButton text={account.address} label="주소 복사" />
        </span>
      )}
    </span>
  );
}

function VerifiedBadge({ withText }: { withText: boolean }) {
  return (
    <span
      aria-label="인증된 아티스트"
      title="관리자가 승인한 아티스트"
      className="inline-flex items-center gap-0.5 rounded-full bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-300"
    >
      ✓{withText && <span>인증된 아티스트</span>}
    </span>
  );
}
