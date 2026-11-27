import type { ConditionRecordResult } from "@/lib/domain/conditionRecord";
import { conditionHistoryWarnings, type PriorCondition } from "@/lib/domain/conditionHistory";
import { ConditionHistoryWarningList } from "./ConditionHistoryWarningList";

/**
 * 상태 기록 모순 경고 (architecture.md 6.7 A1, D14)
 * 이 거래의 상태 기록과 이전 완료 거래 기록을 비교한다. 경고가 없거나 비교할 수 없으면 아무것도 그리지 않는다.
 * 부모가 <Suspense fallback={null}>로 감싼다.
 */
export async function ConditionHistoryWarnings({
  record,
  prior,
}: {
  record: Promise<ConditionRecordResult>;
  prior: Promise<PriorCondition[]>;
}) {
  const [r, p] = await Promise.all([record, prior]);
  if (r.status !== "ok" || r.record.type !== "resale") return null;
  const warnings = conditionHistoryWarnings(r.record, p);
  if (warnings.length === 0) return null;
  return <ConditionHistoryWarningList warnings={warnings} note="이전 거래 기록과 다릅니다. 구매 전 판매자에게 확인하세요." />;
}
