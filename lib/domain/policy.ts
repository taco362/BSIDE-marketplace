/**
 * 재판매 정책 표시와 가격 상한 미리 계산 (화면 안내용)
 * 최종 검증은 항상 컨트랙트가 한다. 계산 규칙은 architecture.md 4.2와 같아야 한다.
 */
import { isSameAddress } from "./format";
import type { Listing, Policy, PrimarySaleState, Token } from "./types";

const BPS_DENOMINATOR = BigInt(10_000);

/** 정책별 수치 허용 범위 (bps, D3). BSideNFT의 PRICE_CAP_*_BPS, ROYALTY_*_BPS 상수와 같아야 한다. Free는 0 */
export const POLICY_BPS_RANGE: Record<Policy, { min: number; max: number }> = {
  PriceCap: { min: 10_000, max: 15_000 },
  Royalty: { min: 100, max: 1_000 },
  Free: { min: 0, max: 0 },
};

/** 퍼센트 문자열 → bps (예: "120" → 12000, "2.5" → 250). 소수 둘째 자리까지, 형식이 틀리면 null */
export function percentToBps(text: string): number | null {
  const match = /^(\d{1,5})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

/**
 * 판매 등록 가격 규칙 (architecture.md 4.2, D1·D9·D10)
 * - primary: 판매자가 아티스트이고 최초 판매 자격이 남아 있음 → 최초 판매가로 고정
 * - cap: 정가 보호형 재판매 → 상한 이하
 * - free: 창작자 상생형·자유 거래형 재판매 → 0보다 크면 됨
 */
export type ListingPriceRule =
  | { kind: "primary"; price: bigint }
  | { kind: "cap"; cap: bigint }
  | { kind: "free" };

export function listingPriceRule(
  token: Pick<Token, "artist" | "primaryEnded" | "policy" | "policyBps" | "initialPrice">,
  seller: string,
): ListingPriceRule {
  if (isSameAddress(seller, token.artist) && !token.primaryEnded) return { kind: "primary", price: token.initialPrice };
  const cap = resaleCap(token);
  return cap === null ? { kind: "free" } : { kind: "cap", cap };
}

/** 가격이 규칙을 지키지 않으면 안내 문구, 지키면 null (화면 안내용, 최종 검증은 컨트랙트) */
export function checkListingPrice(rule: ListingPriceRule, price: bigint): string | null {
  if (price <= BigInt(0)) return "판매 가격은 0보다 커야 합니다.";
  if (rule.kind === "primary" && price !== rule.price) return "최초 판매는 최초 판매가로만 등록할 수 있습니다.";
  if (rule.kind === "cap" && price > rule.cap) return "재판매 상한을 넘는 가격입니다.";
  return null;
}

export const POLICY_LABELS: Record<Policy, string> = {
  PriceCap: "정가 보호형",
  Royalty: "창작자 상생형",
  Free: "자유 거래형",
};

/** basis point → 퍼센트 문자열 (예: 12500 → "125%", 250 → "2.5%") */
export function formatBps(bps: number): string {
  return `${Number((bps / 100).toFixed(2))}%`;
}

/** 정책 수치 설명 (예: "재판매 상한 최초 판매가의 120%") */
export function describePolicy(policy: Policy, policyBps: number): string {
  switch (policy) {
    case "PriceCap":
      return `재판매 상한 최초 판매가의 ${formatBps(policyBps)}`;
    case "Royalty":
      return `재판매 로열티 ${formatBps(policyBps)}`;
    case "Free":
      return "재판매 가격 제한·로열티 없음";
  }
}

/** 정가 보호형 재판매 상한 가격 (wei, 소수점 이하 버림). 그 외 정책은 null */
export function resaleCap(token: Pick<Token, "policy" | "policyBps" | "initialPrice">): bigint | null {
  if (token.policy !== "PriceCap") return null;
  return (token.initialPrice * BigInt(token.policyBps)) / BPS_DENOMINATOR;
}

/**
 * 최초 판매 표시 상태 (D9)
 * - available: 최초 판매 자격이 남아 있음
 * - soldOnPlatform: 플랫폼에서 최초 판매가 완료됨 (isPrimary 거래가 COMPLETED)
 * - endedOffPlatform: 플랫폼 최초 판매 없이 자격이 종료됨 (NFT가 플랫폼 밖에서 아티스트 지갑을 떠남)
 */
export function primarySaleState(
  token: Pick<Token, "primaryEnded">,
  listingsOfToken: Pick<Listing, "isPrimary" | "status">[],
): PrimarySaleState {
  if (!token.primaryEnded) return "available";
  if (listingsOfToken.some((l) => l.isPrimary && l.status === "COMPLETED")) return "soldOnPlatform";
  return "endedOffPlatform";
}

export const PRIMARY_SALE_LABELS: Record<PrimarySaleState, string> = {
  available: "최초 판매 자격 있음",
  soldOnPlatform: "플랫폼 최초 판매 완료",
  endedOffPlatform: "외부 이전으로 최초 판매 자격 종료",
};
