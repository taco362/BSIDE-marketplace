"use client";

import type { ReactNode } from "react";
import { useTx, type TxStep } from "@/hooks/useTx";
import { TxStatus } from "./TxStatus";

const VARIANTS = {
  primary:
    "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300",
  secondary: "border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900",
} as const;

/**
 * 트랜잭션 1회(또는 정해진 단계)를 실행하는 버튼 + 진행 상태
 * 폼 입력이 없는 동작(구매, 수령 승인, 정산 청구, 등록 취소, 출금, 승인 회수)에 쓴다.
 */
export function TxButton({
  label,
  steps,
  disabled = false,
  confirmMessage,
  successMessage,
  variant = "primary",
}: {
  label: string;
  steps: TxStep[];
  disabled?: boolean;
  /** 지정하면 실행 전에 확인 창을 띄운다 (되돌릴 수 없는 동작) */
  confirmMessage?: string;
  successMessage?: ReactNode;
  variant?: keyof typeof VARIANTS;
}) {
  const tx = useTx();

  function onClick() {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    void tx.run(steps);
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || tx.busy}
        className={`rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]}`}
      >
        {tx.busy ? "처리 중…" : label}
      </button>
      <TxStatus state={tx} successMessage={successMessage} />
    </div>
  );
}
