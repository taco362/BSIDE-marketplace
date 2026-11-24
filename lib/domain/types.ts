/**
 * 도메인 타입 (서버·클라이언트 공용, 외부 의존 없음)
 *
 * - 금액(wei)은 bigint, ID·시각(초)은 number로 표현한다.
 * - enum 배열의 순서는 컨트랙트 enum 순서와 같아야 한다 (BSideNFT.Policy, BSideEscrow.Status / CancelReason).
 */

export const POLICIES = ["PriceCap", "Royalty", "Free"] as const;
export type Policy = (typeof POLICIES)[number];

export const LISTING_STATUSES = ["LISTED", "LOCKED", "COMPLETED", "CANCELLED", "DISPUTED"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const CANCEL_REASONS = ["SellerCancelled", "SellerRefunded", "DisputeRefunded"] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

/** NFT 정보와 현재 소유자 (BSideNFT.getTokens) */
export interface Token {
  tokenId: number;
  owner: string;
  /** 현재 소유자가 에스크로 컨트랙트인지 (판매 등록~거래 종료 사이) */
  inEscrow: boolean;
  artist: string;
  initialPrice: bigint;
  policy: Policy;
  policyBps: number;
  /** 최초 판매 자격 종료 여부 (D9). 플랫폼 최초 판매 완료와 다른 개념이다. */
  primaryEnded: boolean;
  tokenURI: string;
}

/** 에스크로 거래 (BSideEscrow.getListings). 현재 상태는 항상 이 값으로 판단한다. */
export interface Listing {
  listingId: number;
  tokenId: number;
  seller: string;
  /** 구매 전에는 null */
  buyer: string | null;
  price: bigint;
  conditionCID: string;
  status: ListingStatus;
  isPrimary: boolean;
  listedAt: number;
  /** 구매 전에는 null */
  lockedAt: number | null;
  /** 종료(COMPLETED, CANCELLED) 전에는 null */
  closedAt: number | null;
  /** 수령 승인 기한 = lockedAt + confirmPeriod. 구매 전에는 null */
  deadline: number | null;
}

export interface ListingWithToken {
  listing: Listing;
  token: Token;
}

/** 최초 판매 표시 상태 (architecture.md 4.1 "최초 판매 자격"과 "플랫폼 최초 판매 완료" 구분) */
export type PrimarySaleState = "available" | "soldOnPlatform" | "endedOffPlatform";

interface TradeEventBase {
  listingId: number;
  /** 블록 시각(초). 알 수 없으면 null */
  timestamp: number | null;
  /** 이벤트 로그에서 얻은 경우에만 존재 */
  txHash: string | null;
}

/** NFT별 거래 이력 항목 (에스크로 이벤트) */
export type TradeEvent = TradeEventBase &
  (
    | { kind: "Listed"; seller: string; price: bigint; conditionCID: string; isPrimary: boolean }
    | { kind: "Purchased"; buyer: string }
    | { kind: "Disputed"; buyer: string }
    | { kind: "DisputeResolved"; refundBuyer: boolean }
    | {
        kind: "Completed";
        seller: string;
        buyer: string;
        price: bigint;
        /** 거래 기록으로 대체 표시할 때는 알 수 없으므로 null */
        royalty: bigint | null;
        conditionCID: string;
      }
    | { kind: "Cancelled"; reason: CancelReason | null }
  );

export interface TokenHistory {
  /** events: 이벤트 로그 / listings: 로그 조회 실패 시 거래 기록의 시각으로 대체 (architecture.md 6.1) */
  source: "events" | "listings";
  events: TradeEvent[];
}
