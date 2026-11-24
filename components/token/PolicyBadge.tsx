import { POLICY_LABELS, formatBps } from "@/lib/domain/policy";
import type { Policy } from "@/lib/domain/types";

const POLICY_STYLES: Record<Policy, string> = {
  PriceCap: "border-indigo-300 text-indigo-700 dark:border-indigo-800 dark:text-indigo-300",
  Royalty: "border-rose-300 text-rose-700 dark:border-rose-800 dark:text-rose-300",
  Free: "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400",
};

/** 재판매 정책 배지 (예: "정가 보호형 120%", "창작자 상생형 5%") */
export function PolicyBadge({ policy, policyBps }: { policy: Policy; policyBps: number }) {
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${POLICY_STYLES[policy]}`}>
      {POLICY_LABELS[policy]}
      {policy !== "Free" && ` ${formatBps(policyBps)}`}
    </span>
  );
}
