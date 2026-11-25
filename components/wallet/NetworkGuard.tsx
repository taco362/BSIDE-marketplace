"use client";

import type { ReactNode } from "react";
import { useWallet } from "@/hooks/useWallet";

const BUTTON =
  "rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900";

/**
 * 거래 기능 보호 (architecture.md 6.5)
 * 조회는 지갑 없이 가능하므로, 거래 버튼·폼이 있는 자리에서만 지갑 연결과 올바른 네트워크를 요구한다.
 * 조건을 만족하면 연결된 계정을 children에 넘긴다.
 */
export function NetworkGuard({ children }: { children: (account: string) => ReactNode }) {
  const wallet = useWallet();

  if (wallet.status === "checking") {
    return <p className="text-sm text-zinc-500">지갑 상태 확인 중…</p>;
  }
  if (wallet.status === "unavailable") {
    return <Notice>거래 기능을 사용하려면 MetaMask가 필요합니다. 조회는 지갑 없이 할 수 있습니다.</Notice>;
  }
  if (wallet.status === "disconnected" || !wallet.account) {
    return (
      <Notice>
        <span>거래하려면 지갑을 연결하세요.</span>
        <button type="button" onClick={wallet.connect} disabled={wallet.pending !== null} className={BUTTON}>
          {wallet.pending === "connect" ? "연결 요청 중…" : "지갑 연결"}
        </button>
        {wallet.error && <ErrorText>{wallet.error}</ErrorText>}
      </Notice>
    );
  }
  if (!wallet.isCorrectChain) {
    return (
      <Notice>
        <span>
          MetaMask 네트워크가 다릅니다 (현재 chainId {wallet.chainId ?? "알 수 없음"}, 필요 {wallet.expectedChainId}).
        </span>
        <button type="button" onClick={wallet.switchNetwork} disabled={wallet.pending !== null} className={BUTTON}>
          {wallet.pending === "switch" ? "전환 요청 중…" : "네트워크 전환"}
        </button>
        {wallet.error && <ErrorText>{wallet.error}</ErrorText>}
      </Notice>
    );
  }
  return <>{children(wallet.account)}</>;
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-zinc-300 p-3 text-sm dark:border-zinc-700">
      {children}
    </div>
  );
}

function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="w-full text-xs text-red-600">
      {children}
    </p>
  );
}
