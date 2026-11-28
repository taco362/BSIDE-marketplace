import { Suspense, type ReactNode } from "react";
import { AccountLabel } from "@/components/account/AccountLabel";
import { ConditionHistoryWarnings } from "@/components/condition/ConditionHistoryWarnings";
import { ConditionRecordFallback, ConditionRecordView } from "@/components/condition/ConditionRecordView";
import { accountOf } from "@/lib/domain/account";
import type { PriorCondition } from "@/lib/domain/conditionHistory";
import type { ConditionRecordResult } from "@/lib/domain/conditionRecord";
import { CANCEL_REASON_LABELS, formatEth, formatTimestamp } from "@/lib/domain/format";
import type { AccountDirectory, TokenHistory, TradeEvent } from "@/lib/domain/types";

/** 상태 기록 CID → 조회 결과 (페이지가 만든다) */
export type ConditionRecordMap = Record<string, Promise<ConditionRecordResult>>;
/** 거래 ID → 모순 경고 비교 대상 (페이지가 만든다, 6.7 A1) */
export type PriorConditionMap = Record<number, Promise<PriorCondition[]>>;

/**
 * NFT별 플랫폼 거래 이력 (에스크로 이벤트 타임라인).
 * 판매 등록 항목에 그때의 상품 상태 기록(U4)과 이전 완료 거래 기록과의 모순 경고(A1)를 함께 보인다.
 */
export function TradeTimeline({
  tokenId,
  history,
  accounts,
  conditionRecords,
  priorConditions,
}: {
  tokenId: number;
  history: TokenHistory;
  accounts: AccountDirectory;
  conditionRecords: ConditionRecordMap;
  priorConditions: PriorConditionMap;
}) {
  return (
    <div className="flex flex-col gap-3">
      {history.source === "listings" && (
        <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          이벤트 로그를 조회하지 못해 거래 기록에 저장된 시각으로 대신 표시합니다. 분쟁 제기 시각, 취소 사유, 로열티는 표시되지
          않습니다.
        </p>
      )}
      {history.events.length === 0 ? (
        <p className="text-sm text-zinc-500">플랫폼 거래 이력이 없습니다.</p>
      ) : (
        <ol className="flex flex-col border-l border-zinc-200 dark:border-zinc-800">
          {history.events.map((event, i) => (
            <li key={`${event.listingId}-${event.kind}-${i}`} className="relative flex flex-col gap-1 pb-5 pl-5 last:pb-0">
              <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-zinc-400 dark:bg-zinc-600" />
              <p className="text-sm">
                <span className="font-medium">{EVENT_TITLES[event.kind]}</span>
                <span className="text-zinc-500"> · 거래 #{event.listingId}</span>
              </p>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">{describe(event, accounts)}</div>
              {event.kind === "Listed" && event.conditionCID in conditionRecords && (
                <div className="mt-1 flex max-w-xl flex-col gap-2">
                  {event.listingId in priorConditions && (
                    <Suspense fallback={null}>
                      <ConditionHistoryWarnings
                        record={conditionRecords[event.conditionCID]}
                        prior={priorConditions[event.listingId]}
                      />
                    </Suspense>
                  )}
                  <Suspense fallback={<ConditionRecordFallback />}>
                    <ConditionRecordView
                      cid={event.conditionCID}
                      result={conditionRecords[event.conditionCID]}
                      listing={{ tokenId, seller: event.seller, isPrimary: event.isPrimary }}
                    />
                  </Suspense>
                </div>
              )}
              <p className="text-xs text-zinc-500">
                {event.timestamp !== null ? formatTimestamp(event.timestamp) : "시각 알 수 없음"}
                {event.txHash && (
                  <span className="ml-2 font-mono" title={event.txHash}>
                    tx {event.txHash.slice(0, 10)}…
                  </span>
                )}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const EVENT_TITLES: Record<TradeEvent["kind"], string> = {
  Listed: "판매 등록",
  Purchased: "구매 (대금 예치)",
  Disputed: "분쟁 제기",
  DisputeResolved: "분쟁 중재",
  Completed: "거래 완료 · NFT 이전",
  Cancelled: "거래 취소",
};

function describe(event: TradeEvent, accounts: AccountDirectory): ReactNode {
  const account = (address: string) => <AccountLabel account={accountOf(accounts, address)} />;
  switch (event.kind) {
    case "Listed":
      return (
        <>
          {account(event.seller)} · {formatEth(event.price)} · {event.isPrimary ? "최초 판매" : "재판매"}
        </>
      );
    case "Purchased":
      return (
        <>
          구매자 {account(event.buyer)}
        </>
      );
    case "Disputed":
      return (
        <>
          구매자 {account(event.buyer)} 이의 제기
        </>
      );
    case "DisputeResolved":
      return event.refundBuyer ? "결과: 구매자 환불" : "결과: 판매자 정산";
    case "Completed":
      return (
        <>
          {account(event.seller)} → {account(event.buyer)} · {formatEth(event.price)}
          {event.royalty !== null && event.royalty > BigInt(0) && <> · 로열티 {formatEth(event.royalty)}</>}
        </>
      );
    case "Cancelled":
      return event.reason ? CANCEL_REASON_LABELS[event.reason] : "사유 알 수 없음";
  }
}
