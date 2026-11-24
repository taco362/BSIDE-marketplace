import "server-only";

/**
 * 컨트랙트 반환값 → 도메인 타입 변환
 * ethers v6는 정수를 bigint로 반환한다.
 */
import { DEPLOYMENT } from "@/lib/contracts";
import { isSameAddress } from "@/lib/domain/format";
import { LISTING_STATUSES, POLICIES, type Listing, type Token } from "@/lib/domain/types";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ESCROW_ADDRESS = DEPLOYMENT.contracts.BSideEscrow.address;
const ZERO = BigInt(0);

/** BSideNFT.getTokens 항목 */
export interface RawTokenView {
  tokenId: bigint;
  owner: string;
  info: { artist: string; initialPrice: bigint; policy: bigint; policyBps: bigint };
  primaryEnded: boolean;
  tokenURI: string;
}

/** BSideEscrow.getListings 항목 */
export interface RawListingView {
  listingId: bigint;
  listing: {
    tokenId: bigint;
    seller: string;
    buyer: string;
    price: bigint;
    conditionCID: string;
    status: bigint;
    isPrimary: boolean;
    listedAt: bigint;
    lockedAt: bigint;
    closedAt: bigint;
  };
}

/** 컨트랙트 enum 값(순서) → 도메인 문자열 */
export function enumValue<T>(values: readonly T[], raw: bigint, name: string): T {
  const value = values[Number(raw)];
  if (value === undefined) throw new Error(`알 수 없는 ${name} 값: ${raw}`);
  return value;
}

export function toToken(raw: RawTokenView): Token {
  return {
    tokenId: Number(raw.tokenId),
    owner: raw.owner,
    inEscrow: isSameAddress(raw.owner, ESCROW_ADDRESS),
    artist: raw.info.artist,
    initialPrice: raw.info.initialPrice,
    policy: enumValue(POLICIES, raw.info.policy, "Policy"),
    policyBps: Number(raw.info.policyBps),
    primaryEnded: raw.primaryEnded,
    tokenURI: raw.tokenURI,
  };
}

/** confirmPeriod로 수령 승인 기한(deadline)을 함께 계산한다. */
export function toListing(raw: RawListingView, confirmPeriod: number): Listing {
  const l = raw.listing;
  const lockedAt = l.lockedAt === ZERO ? null : Number(l.lockedAt);
  return {
    listingId: Number(raw.listingId),
    tokenId: Number(l.tokenId),
    seller: l.seller,
    buyer: l.buyer === ZERO_ADDRESS ? null : l.buyer,
    price: l.price,
    conditionCID: l.conditionCID,
    status: enumValue(LISTING_STATUSES, l.status, "Status"),
    isPrimary: l.isPrimary,
    listedAt: Number(l.listedAt),
    lockedAt,
    closedAt: l.closedAt === ZERO ? null : Number(l.closedAt),
    deadline: lockedAt === null ? null : lockedAt + confirmPeriod,
  };
}
