import "server-only";

import type { MarketReader } from "./reader";
import { chainReader } from "./chain/chainReader";

export type { MarketReader };

/** MVP는 구현체가 chainReader 하나뿐이므로 선택 로직 없이 바로 반환한다 (architecture.md 6.1) */
export function getMarketReader(): MarketReader {
  return chainReader;
}
