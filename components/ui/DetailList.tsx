import type { ReactNode } from "react";

/** 항목명 / 값 목록 */
export function DetailList({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">{children}</dl>;
}

export function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}
