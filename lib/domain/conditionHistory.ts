/**
 * 상태 기록 모순 경고 (docs/architecture.md 6.7 A1, proposal.md D14)
 * 같은 NFT의 이전 완료 거래 기록과 지금 기록을 정해진 규칙으로 비교한다. AI를 쓰지 않는다. 외부 의존 없음.
 */
import { conditionRecordWarnings, type ConditionRecordResult } from "./conditionRecord";
import type { Listing } from "./types";
import { NO_DEFECTS, type ConditionInput } from "./upload";

/** 비교에 쓰는 이전 완료 거래의 상태 (거래 ID 오름차순으로 넘긴다) */
export interface PriorCondition {
  listingId: number;
  sealed: boolean;
  defects: string;
}

export interface ConditionHistoryWarning {
  /** strong: 실물로는 일어날 수 없는 변화 (개봉 → 미개봉) / caution: 정상 사유가 있을 수 있는 변화 (하자 소멸) */
  level: "strong" | "caution";
  message: string;
}

/** 비교 대상 거래: 같은 토큰에서 beforeListingId보다 앞서 COMPLETED된 거래 (거래 ID 오름차순) */
export function priorCompletedListings(listings: Listing[], beforeListingId: number): Listing[] {
  return listings
    .filter((l) => l.status === "COMPLETED" && l.listingId < beforeListingId)
    .sort((a, b) => a.listingId - b.listingId);
}

/**
 * 읽은 기록 중 비교에 쓸 수 있는 것만 남긴다.
 * 재판매 기록이고 기록의 NFT 번호·판매자가 그 거래와 맞는 것만 쓴다 (최초 판매 기록은 개봉 여부가 없다).
 */
export function toPriorConditions(entries: { listing: Listing; result: ConditionRecordResult }[]): PriorCondition[] {
  const prior: PriorCondition[] = [];
  for (const { listing, result } of entries) {
    if (result.status !== "ok" || result.record.type !== "resale") continue;
    if (conditionRecordWarnings(result.record, listing).length > 0) continue;
    prior.push({ listingId: listing.listingId, sealed: result.record.sealed, defects: result.record.defects });
  }
  return prior;
}

/** 지금 기록(또는 입력 중인 값)과 이전 완료 거래 기록의 모순. 하자 빈칸은 "없음"으로 본다 */
export function conditionHistoryWarnings(
  current: Pick<ConditionInput, "sealed" | "defects">,
  prior: PriorCondition[],
): ConditionHistoryWarning[] {
  const warnings: ConditionHistoryWarning[] = [];

  const opened = prior.find((p) => !p.sealed);
  if (current.sealed && opened) {
    warnings.push({
      level: "strong",
      message: `이전 거래 #${opened.listingId}에서는 "개봉" 상태로 거래되었는데, 이번에는 "미개봉"으로 기록되어 있습니다.`,
    });
  }

  const last = prior.at(-1);
  const currentDefects = current.defects.trim() || NO_DEFECTS;
  if (last && last.defects !== NO_DEFECTS && currentDefects === NO_DEFECTS) {
    warnings.push({
      level: "caution",
      message: `직전 거래 #${last.listingId}에 기록된 하자("${shorten(last.defects)}")가 이번에는 "${NO_DEFECTS}"으로 기록되어 있습니다.`,
    });
  }

  return warnings;
}

function shorten(text: string, max = 40): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}
