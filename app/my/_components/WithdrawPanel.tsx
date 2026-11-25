"use client";

import { TxButton } from "@/components/tx/TxButton";
import { NetworkGuard } from "@/components/wallet/NetworkGuard";
import { formatEth, isSameAddress } from "@/lib/domain/format";
import { withdraw } from "@/lib/tx/escrow";

/** 출금 대기액(정산 대금·로열티·환불)과 출금 버튼 (pull payment, architecture.md 5.1) */
export function WithdrawPanel({ account, pending }: { account: string; pending: bigint }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        출금 대기액 <span className="text-lg font-semibold">{formatEth(pending)}</span>
      </p>
      <NetworkGuard>
        {(connected) =>
          isSameAddress(connected, account) ? (
            <TxButton
              label="출금"
              disabled={pending <= BigInt(0)}
              steps={[{ label: "출금", send: (s) => withdraw(s) }]}
              successMessage="출금했습니다. MetaMask 잔액을 확인하세요."
            />
          ) : (
            <p className="text-sm text-zinc-500">출금은 이 계정의 지갑으로 연결해야 할 수 있습니다.</p>
          )
        }
      </NetworkGuard>
    </div>
  );
}
