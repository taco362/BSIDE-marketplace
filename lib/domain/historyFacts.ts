/**
 * AI 거래 이력 요약에 넘길 사실 목록 (docs/architecture.md 6.7 A3, proposal.md D14)
 * 숫자(횟수·가격·거래 번호)와 경고는 여기서 코드로 계산한다. AI는 이 목록으로 문장만 쓴다. 외부 의존 없음.
 * 현재 상태는 거래 기록(Listing)의 status를 기준으로 한다 (architecture.md 6.1).
 */
import {
  conditionHistoryWarnings,
  priorCompletedListings,
  toPriorConditions,
} from "./conditionHistory";
import type { ConditionRecordResult } from "./conditionRecord";
import { STATUS_LABELS, formatEth } from "./format";
import { PRIMARY_SALE_LABELS, describePolicy, primarySaleState } from "./policy";
import type { Listing, Token } from "./types";

export interface HistoryFacts {
  tokenId: number;
  /** 사실 한 줄씩 (AI 입력, 화면 표시 없음) */
  lines: string[];
  /** 요약 문장에 나와도 되는 숫자 (AI 출력 확인용) */
  numbers: Set<string>;
  /** A1 경고가 있는지 (요약에 반드시 언급해야 함) */
  hasWarnings: boolean;
  /** 같은 사실이면 같은 값 (요약 캐시 키) */
  key: string;
}

/**
 * @param listings 이 토큰의 모든 거래 (거래 ID 오름차순)
 * @param records 거래 ID → 그 거래의 상태 기록 조회 결과
 */
export function buildHistoryFacts(
  token: Token,
  listings: Listing[],
  records: Record<number, ConditionRecordResult>,
): HistoryFacts {
  const lines: string[] = [];
  const completed = listings.filter((l) => l.status === "COMPLETED");
  const cancelled = listings.filter((l) => l.status === "CANCELLED");
  let hasWarnings = false;

  lines.push(`NFT #${token.tokenId}, 재판매 정책: ${describePolicy(token.policy, token.policyBps)}, 최초 판매가 ${formatEth(token.initialPrice)}`);
  lines.push(`최초 판매 상태: ${PRIMARY_SALE_LABELS[primarySaleState(token, listings)]}`);
  lines.push(
    `플랫폼 거래 등록 ${listings.length}건 중 완료 ${completed.length}건, 취소 ${cancelled.length}건, 진행 중 ${listings.length - completed.length - cancelled.length}건`,
  );
  if (completed.length >= 2) {
    const first = completed[0];
    const last = completed[completed.length - 1];
    lines.push(`완료 거래 가격: 처음 ${formatEth(first.price)}(거래 #${first.listingId}) → 마지막 ${formatEth(last.price)}(거래 #${last.listingId})`);
  }

  for (const listing of listings) {
    const kind = listing.isPrimary ? "최초 판매" : "재판매";
    const parts = [`거래 #${listing.listingId}: ${kind}, ${formatEth(listing.price)}, 상태 ${STATUS_LABELS[listing.status]}`];
    const result = records[listing.listingId];
    if (!result || result.status !== "ok") {
      parts.push("상태 기록 읽지 못함");
    } else if (result.record.type === "primary") {
      parts.push("상품 상태: 아티스트 최초 판매 상품");
    } else {
      const r = result.record;
      parts.push(`개봉 여부 ${r.sealed ? "미개봉" : "개봉"}, 하자 "${oneLine(r.defects)}"`);
      if (r.aiAssisted) parts.push("AI 초안 활용 기록");
      const prior = toPriorConditions(
        priorCompletedListings(listings, listing.listingId).map((l) => ({ listing: l, result: records[l.listingId] ?? { status: "unavailable" } })),
      );
      for (const w of conditionHistoryWarnings(r, prior)) {
        hasWarnings = true;
        parts.push(`경고(${w.level === "strong" ? "불일치" : "주의"}): ${w.message}`);
      }
    }
    lines.push(parts.join(" / "));
  }

  const text = lines.join("\n");
  return {
    tokenId: token.tokenId,
    lines,
    numbers: new Set(text.match(/\d+(?:\.\d+)?/g) ?? []),
    hasWarnings,
    key: text,
  };
}

function oneLine(text: string, max = 60): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/**
 * AI 요약에 사실 목록에 없는 숫자가 있는지 확인한다. 있으면 그 숫자 목록.
 * 0~10의 정수(문장 속 "1~3문장", "두 번째" 등 흔한 표현)는 허용한다.
 */
export function unknownNumbers(summary: string, facts: Pick<HistoryFacts, "numbers">): string[] {
  return (summary.match(/\d+(?:\.\d+)?/g) ?? []).filter((n) => {
    if (facts.numbers.has(n)) return false;
    return !(/^\d+$/.test(n) && Number(n) <= 10);
  });
}
