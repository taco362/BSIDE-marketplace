/**
 * 조회 인터페이스 (docs/architecture.md 6.1)
 * 화면은 이 인터페이스와 lib/domain 타입에만 의존한다. 구현체: chain/chainReader.ts (MVP)
 * 메서드는 화면에서 실제로 쓰는 것만 둔다.
 */
import type { AccountDirectory, Listing, ListingWithToken, Token, TokenHistory } from "@/lib/domain/types";

export interface MarketReader {
  /** 판매 중(LISTED)인 거래와 토큰 정보. 거래 ID 내림차순(최근 등록 순) */
  getActiveListings(): Promise<ListingWithToken[]>;
  /** 거래 1건과 토큰 정보. 없으면 null */
  getListing(listingId: number): Promise<ListingWithToken | null>;
  /** 토큰 1개. 없으면 null */
  getToken(tokenId: number): Promise<Token | null>;
  /** 해당 토큰의 모든 거래. 거래 ID 오름차순 */
  getListingsByToken(tokenId: number): Promise<Listing[]>;
  /** 해당 토큰의 거래 이력 타임라인. 시간 오름차순 */
  getTokenHistory(tokenId: number): Promise<TokenHistory>;
  /** 화면에 표시할 주소들의 활동명·인증 여부 (D7). 빈 값과 중복은 무시한다. 결과 키는 소문자 주소 */
  getAccounts(addresses: (string | null | undefined)[]): Promise<AccountDirectory>;
}
