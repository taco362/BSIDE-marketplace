"use client";

import { useWallet } from "@/hooks/useWallet";
import { shortenAddress } from "@/lib/domain/format";

/**
 * 헤더의 지갑 상태 표시 (선택 사항)
 * 조회(목록·상세·이력)는 지갑 없이 가능하므로 연결을 강요하지 않는다.
 * 거래 기능(발행·판매·구매 등)에서 연결과 네트워크 확인을 요구하는 것은 NetworkGuard가 맡는다 (6단계, architecture.md 6.5).
 */
export function ConnectButton() {
  const wallet = useWallet();

  // 확인 중이거나 MetaMask가 없으면 아무것도 요구하지 않는다 (조회 전용 사용자)
  if (wallet.status === "checking") return <span aria-hidden className="h-8" />;
  if (wallet.status === "unavailable") {
    return <span className="text-xs text-zinc-500">지갑 없이 조회 중</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {wallet.status === "disconnected" ? (
        <button
          type="button"
          onClick={wallet.connect}
          disabled={wallet.pending !== null}
          className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          {wallet.pending === "connect" ? "연결 요청 중…" : "지갑 연결"}
        </button>
      ) : (
        <div className="flex items-center gap-2">
          {!wallet.isCorrectChain && (
            <button
              type="button"
              onClick={wallet.switchNetwork}
              disabled={wallet.pending !== null}
              title={`현재 chainId ${wallet.chainId ?? "알 수 없음"} → ${wallet.expectedChainId}. 거래 기능을 쓸 때만 필요합니다.`}
              className="text-xs text-amber-700 underline underline-offset-2 disabled:opacity-60 dark:text-amber-400"
            >
              {wallet.pending === "switch" ? "전환 요청 중…" : "다른 네트워크 · 전환"}
            </button>
          )}
          <span
            title={wallet.account ?? undefined}
            className="rounded-full border border-zinc-300 px-3 py-1.5 font-mono text-sm dark:border-zinc-700"
          >
            {wallet.account ? shortenAddress(wallet.account) : ""}
          </span>
        </div>
      )}
      {wallet.error && (
        <p role="alert" className="max-w-xs text-right text-xs text-red-600">
          {wallet.error}
        </p>
      )}
    </div>
  );
}
