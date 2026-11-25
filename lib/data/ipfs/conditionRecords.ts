import "server-only";

/**
 * 상품 상태 기록 조회 (docs/architecture.md 6.6, U4)
 * 페이지가 거래마다 호출해 결과 Promise를 컴포넌트에 넘긴다 (기록마다 <Suspense>로 따로 표시).
 * 오류를 던지지 않고 결과 종류로 돌려준다. 게이트웨이가 느리거나 실패해도 페이지의 나머지는 표시된다.
 */
import { cache } from "react";
import { parseConditionRecord, type ConditionRecordResult } from "@/lib/domain/conditionRecord";
import { GatewayError, fetchIpfsJson } from "@/lib/ipfs/gateway";

/** 같은 요청 안에서 같은 CID는 한 번만 읽는다 */
export const getConditionRecord = cache(async (cid: string): Promise<ConditionRecordResult> => {
  try {
    const record = parseConditionRecord(await fetchIpfsJson(cid));
    return record ? { status: "ok", record } : { status: "invalid" };
  } catch (error) {
    if (error instanceof GatewayError) return { status: error.kind === "format" ? "invalid" : "unavailable" };
    console.error("[conditionRecords] 예상하지 못한 오류", cid, error);
    return { status: "unavailable" };
  }
});
