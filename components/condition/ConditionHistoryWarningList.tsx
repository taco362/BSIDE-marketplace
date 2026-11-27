import type { ConditionHistoryWarning } from "@/lib/domain/conditionHistory";

/** 경고 목록 표시 (판매 등록 화면의 판매자 안내에서도 쓴다) */
export function ConditionHistoryWarningList({
  warnings,
  note,
}: {
  warnings: ConditionHistoryWarning[];
  note: string;
}) {
  const strong = warnings.some((w) => w.level === "strong");
  return (
    <div
      role="alert"
      className={
        strong
          ? "flex flex-col gap-1 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          : "flex flex-col gap-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
      }
    >
      <p className="font-medium">{strong ? "⚠ 상태 기록 불일치" : "⚠ 상태 기록 확인 필요"}</p>
      <ul className="flex flex-col gap-0.5">
        {warnings.map((w) => (
          <li key={w.message}>
            {w.level === "strong" ? "· " : "· (주의) "}
            {w.message}
          </li>
        ))}
      </ul>
      <p className="text-xs opacity-80">{note}</p>
    </div>
  );
}
