/**
 * 표시용 변환 함수 (외부 의존 없음)
 */
import type { CancelReason, ListingStatus } from "./types";

const WEI_PER_ETH = BigInt("1000000000000000000");
const ZERO = BigInt(0);

/** wei → "0.05 ETH" (반올림 없이 끝의 0만 제거) */
export function formatEth(wei: bigint): string {
  const negative = wei < ZERO;
  const abs = negative ? -wei : wei;
  const whole = abs / WEI_PER_ETH;
  const fraction = (abs % WEI_PER_ETH).toString().padStart(18, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""} ETH`;
}

/** 0x1234…abcd */
export function shortenAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function isSameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "Asia/Seoul",
});

/** 블록 시각(초) → 한국 시간 문자열 */
export function formatTimestamp(seconds: number): string {
  return DATE_TIME_FORMAT.format(new Date(seconds * 1000));
}

export const STATUS_LABELS: Record<ListingStatus, string> = {
  LISTED: "판매 중",
  LOCKED: "구매 완료 · 수령 대기",
  COMPLETED: "거래 완료",
  CANCELLED: "취소됨",
  DISPUTED: "분쟁 중",
};

export const CANCEL_REASON_LABELS: Record<CancelReason, string> = {
  SellerCancelled: "판매자 등록 취소",
  SellerRefunded: "판매자 환불",
  DisputeRefunded: "분쟁 중재 결과 구매자 환불",
};
