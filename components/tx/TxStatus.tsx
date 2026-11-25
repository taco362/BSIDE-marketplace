"use client";

import type { ReactNode } from "react";
import type { TxState } from "@/hooks/useTx";

/** 트랜잭션 진행 상태 표시: 서명 대기 → 블록 포함 대기 → 성공 / 실패 */
export function TxStatus({ state, successMessage }: { state: TxState; successMessage?: ReactNode }) {
  if (state.phase === "idle") return null;

  const stepText = state.stepCount > 1 ? ` (${state.step}/${state.stepCount})` : "";

  switch (state.phase) {
    case "signing":
      return (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          MetaMask에서 서명을 기다리는 중{stepText}: {state.label}
        </p>
      );
    case "pending":
      return (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          블록 포함을 기다리는 중{stepText}: {state.label}
          {state.hash && <span className="block break-all font-mono text-xs text-zinc-500">tx {state.hash}</span>}
        </p>
      );
    case "success":
      return (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
          {successMessage ?? "완료되었습니다."}
        </p>
      );
    case "error":
      return (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      );
  }
}
