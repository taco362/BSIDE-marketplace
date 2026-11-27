"use client";

import { use } from "react";
import { ConditionHistoryWarningList } from "@/components/condition/ConditionHistoryWarningList";
import { conditionHistoryWarnings, type PriorCondition } from "@/lib/domain/conditionHistory";
import type { ConditionInput } from "@/lib/domain/upload";

/**
 * 판매자 안내 (architecture.md 6.7 A1, D14): 입력 중인 상태가 이전 완료 거래 기록과 맞지 않으면 알린다.
 * 등록은 막지 않는다. 부모가 <Suspense fallback={null}>로 감싼다 (서버가 넘긴 Promise를 use로 기다림).
 */
export function PriorConditionNotice({
  value,
  prior,
}: {
  value: ConditionInput;
  prior: Promise<PriorCondition[]>;
}) {
  const warnings = conditionHistoryWarnings(value, use(prior));
  if (warnings.length === 0) return null;
  return (
    <ConditionHistoryWarningList
      warnings={warnings}
      note="이대로 등록할 수 있지만, 구매자 화면에 이 경고가 함께 표시됩니다. 실제 상품 상태와 같은지 확인하세요."
    />
  );
}
