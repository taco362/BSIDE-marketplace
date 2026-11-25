import Link from "next/link";
import { PolicyBadge } from "@/components/token/PolicyBadge";
import { formatEth, isSameAddress } from "@/lib/domain/format";
import type { Token } from "@/lib/domain/types";

/** 보유 NFT 목록 (에스크로에 예치된 NFT는 판매 거래에 나온다). 판매 등록 화면으로 들어가는 곳 */
export function MyTokenList({ tokens, account }: { tokens: Token[]; account: string }) {
  if (tokens.length === 0) {
    return <p className="text-sm text-zinc-500">보유한 NFT가 없습니다.</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
      {tokens.map((token) => {
        const primary = isSameAddress(token.artist, account) && !token.primaryEnded;
        return (
          <li key={token.tokenId} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Link href={`/tokens/${token.tokenId}`} className="font-medium underline underline-offset-2">
                NFT #{token.tokenId}
              </Link>
              <PolicyBadge policy={token.policy} policyBps={token.policyBps} />
              <span className="text-zinc-500">최초 판매가 {formatEth(token.initialPrice)}</span>
              {primary && <span className="text-zinc-500">· 최초 판매 가능</span>}
            </div>
            <Link
              href={`/sell/${token.tokenId}`}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              {primary ? "최초 판매 등록" : "판매 등록"}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
