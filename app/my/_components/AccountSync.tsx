"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { NetworkGuard } from "@/components/wallet/NetworkGuard";
import { useWallet } from "@/hooks/useWallet";
import { isSameAddress, shortenAddress } from "@/lib/domain/format";

/**
 * 연결된 지갑 계정을 주소창(?account=)에 반영해 서버가 그 계정 기준으로 조회하게 한다.
 * MetaMask에서 계정을 바꾸면 화면도 새 계정으로 바뀐다.
 */
export function AccountSync({ current }: { current: string | null }) {
  const router = useRouter();
  const wallet = useWallet();
  const connected = wallet.status === "connected" ? wallet.account : null;

  useEffect(() => {
    if (connected && !isSameAddress(connected, current)) {
      router.replace(`/my?account=${connected}`, { scroll: false });
    }
  }, [connected, current, router]);

  if (current === null) {
    return <NetworkGuard>{() => <p className="text-sm text-zinc-500">계정 정보를 불러오는 중…</p>}</NetworkGuard>;
  }
  return (
    <p className="text-sm text-zinc-500">
      조회 계정 <span className="font-mono" title={current}>{shortenAddress(current)}</span>
      {!isSameAddress(connected, current) && " (연결된 지갑과 다른 계정 · 거래 버튼은 이 계정으로 연결해야 사용 가능)"}
    </p>
  );
}
