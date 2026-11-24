import "server-only";

/**
 * 블록체인 조회 구현체 (docs/architecture.md 4.4, 6.1)
 *
 * - 현재 상태는 항상 getListings / getTokens의 값으로 판단한다. 이벤트는 이력 표시에만 사용한다 (events.ts).
 * - 필터링(판매 중, 토큰별)은 컨트랙트가 아니라 여기서 수행한다.
 * - 모든 조회는 요청 시점에 실행한다 (connection()). 같은 요청 안의 중복 조회는 React.cache로 한 번만 한다.
 */
import { cache } from "react";
import { connection } from "next/server";
import { unstable_rethrow } from "next/navigation";
import type { Contract } from "ethers";
import { getEscrowContract, getNftContract } from "@/lib/contracts";
import type { Listing, ListingWithToken, Token, TokenHistory } from "@/lib/domain/types";
import type { MarketReader } from "../reader";
import { toChainReadError } from "./errors";
import { eventsFromListings, readTokenEvents } from "./events";
import { toListing, toToken, type RawListingView, type RawTokenView } from "./mappers";
import { getProvider } from "./provider";

/** getListings / getTokens 한 번에 읽는 개수 */
const PAGE_SIZE = 50;

function escrow(): Contract {
  return getEscrowContract(getProvider());
}

function nft(): Contract {
  return getNftContract(getProvider());
}

function isValidId(id: number): boolean {
  return Number.isSafeInteger(id) && id > 0;
}

// ───────────────────────── 기본 조회 (요청 단위 캐시) ─────────────────────────

const readConfirmPeriod = cache(async (): Promise<number> => {
  await connection();
  return Number(await escrow().confirmPeriod());
});

async function readListingsPage(offset: number, limit: number): Promise<Listing[]> {
  await connection();
  const [rows, confirmPeriod] = await Promise.all([
    escrow().getListings(offset, limit) as Promise<RawListingView[]>,
    readConfirmPeriod(),
  ]);
  return rows.map((row) => toListing(row, confirmPeriod));
}

async function readTokensPage(offset: number, limit: number): Promise<Token[]> {
  await connection();
  const rows = (await nft().getTokens(offset, limit)) as RawTokenView[];
  return rows.map(toToken);
}

/** 전체 거래 (거래 ID 오름차순) */
const readAllListings = cache(async (): Promise<Listing[]> => {
  await connection();
  const count = Number(await escrow().listingCount());
  const pages: Promise<Listing[]>[] = [];
  for (let offset = 0; offset < count; offset += PAGE_SIZE) pages.push(readListingsPage(offset, PAGE_SIZE));
  return (await Promise.all(pages)).flat();
});

/** 전체 토큰 (토큰 ID 오름차순) */
const readAllTokens = cache(async (): Promise<Token[]> => {
  await connection();
  const count = Number(await nft().totalMinted());
  const pages: Promise<Token[]>[] = [];
  for (let offset = 0; offset < count; offset += PAGE_SIZE) pages.push(readTokensPage(offset, PAGE_SIZE));
  return (await Promise.all(pages)).flat();
});

const readToken = cache(async (tokenId: number): Promise<Token | null> => {
  if (!isValidId(tokenId)) return null;
  const [token] = await readTokensPage(tokenId - 1, 1);
  return token ?? null;
});

const readListingsByToken = cache(async (tokenId: number): Promise<Listing[]> => {
  return (await readAllListings()).filter((l) => l.tokenId === tokenId);
});

// ───────────────────────── MarketReader 구현 ─────────────────────────

/**
 * 조회 함수의 오류를 화면에 보여줘도 안전한 ChainReadError로 바꾼다 (errors.ts).
 * Next.js 내부 제어 오류(notFound, 프리렌더 중단 등)는 그대로 다시 던진다.
 */
function safely<A extends unknown[], R>(fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      unstable_rethrow(error);
      console.error("[chainReader] 조회 실패", error);
      throw toChainReadError(error);
    }
  };
}

export const chainReader: MarketReader = {
  getActiveListings: safely(async (): Promise<ListingWithToken[]> => {
    const [listings, tokens] = await Promise.all([readAllListings(), readAllTokens()]);
    const tokensById = new Map(tokens.map((t) => [t.tokenId, t]));
    const result: ListingWithToken[] = [];
    for (const listing of listings) {
      const token = tokensById.get(listing.tokenId);
      if (listing.status === "LISTED" && token) result.push({ listing, token });
    }
    return result.reverse();
  }),

  getListing: safely(async (listingId: number): Promise<ListingWithToken | null> => {
    if (!isValidId(listingId)) return null;
    const [listing] = await readListingsPage(listingId - 1, 1);
    if (!listing) return null;
    const token = await readToken(listing.tokenId);
    return token ? { listing, token } : null;
  }),

  getToken: safely(readToken),

  getListingsByToken: safely(readListingsByToken),

  getTokenHistory: safely(async (tokenId: number): Promise<TokenHistory> => {
    const listings = await readListingsByToken(tokenId);
    try {
      const events = await readTokenEvents(
        tokenId,
        listings.map((l) => l.listingId),
      );
      return { source: "events", events };
    } catch (error) {
      unstable_rethrow(error);
      console.error(`[chainReader] 토큰 #${tokenId} 이벤트 조회 실패, 거래 기록으로 대체합니다.`, error);
      return { source: "listings", events: eventsFromListings(listings) };
    }
  }),
};
