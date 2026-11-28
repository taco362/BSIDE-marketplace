/** 도메인 단위 테스트 공용 값 (docs/architecture.md 9장) */
import type { Listing, Token } from "@/lib/domain/types";

export const ARTIST = "0x1111111111111111111111111111111111111111";
export const SELLER = "0x2222222222222222222222222222222222222222";
export const BUYER = "0x3333333333333333333333333333333333333333";
export const ESCROW = "0x9999999999999999999999999999999999999999";

/** 형식이 맞는 CID v1 (base32, 실제 파일과 무관) */
export const CID_A = "bafkreiac64jwaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
export const CID_B = "bafkreiac64jwbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
export const CID_C = "bafkreiac64jwcccccccccccccccccccccccccccccccccccccccccccccc";
export const CID_D = "bafkreiac64jwdddddddddddddddddddddddddddddddddddddddddddddd";

export const ETH = BigInt("1000000000000000000");

export function token(overrides: Partial<Token> = {}): Token {
  return {
    tokenId: 1,
    owner: ARTIST,
    inEscrow: false,
    artist: ARTIST,
    initialPrice: ETH / BigInt(10),
    policy: "PriceCap",
    policyBps: 12_000,
    primaryEnded: false,
    tokenURI: `ipfs://${CID_A}`,
    ...overrides,
  };
}

export function listing(overrides: Partial<Listing> = {}): Listing {
  return {
    listingId: 1,
    tokenId: 1,
    seller: SELLER,
    buyer: BUYER,
    price: ETH / BigInt(10),
    conditionCID: CID_A,
    status: "COMPLETED",
    isPrimary: false,
    listedAt: 1_000,
    lockedAt: 2_000,
    closedAt: 3_000,
    deadline: 2_300,
    ...overrides,
  };
}
