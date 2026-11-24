/**
 * 계정 표시 정보 조회 헬퍼 (외부 의존 없음)
 */
import type { AccountDirectory, AccountProfile, TradeEvent } from "./types";

/** 거래 이력에 표시되는 주소 (판매자, 구매자) */
export function tradeEventAddresses(events: TradeEvent[]): string[] {
  return events.flatMap((e) => {
    switch (e.kind) {
      case "Listed":
        return [e.seller];
      case "Completed":
        return [e.seller, e.buyer];
      case "Purchased":
      case "Disputed":
        return [e.buyer];
      default:
        return [];
    }
  });
}

/** 디렉터리에서 계정 정보를 찾는다. 없으면 활동명·인증이 없는 일반 계정으로 본다. */
export function accountOf(directory: AccountDirectory, address: string): AccountProfile {
  return directory[address.toLowerCase()] ?? { address, artistName: null, verifiedArtist: false };
}

/** 빈 값을 제외하고 대소문자 구분 없이 중복을 제거한 주소 목록 */
export function uniqueAddresses(addresses: (string | null | undefined)[]): string[] {
  const seen = new Map<string, string>();
  for (const a of addresses) {
    if (a && !seen.has(a.toLowerCase())) seen.set(a.toLowerCase(), a);
  }
  return [...seen.values()];
}
