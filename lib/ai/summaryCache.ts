import "server-only";

/**
 * AI 이력 요약 메모리 캐시 (docs/architecture.md 6.7 A3)
 * 같은 사실 목록(HistoryFacts.key)이면 AI를 다시 부르지 않는다. 거래 상태나 기록이 바뀌면 키가 달라진다.
 * 한계: 서버 인스턴스마다 따로 있고 재시작하면 사라진다 (DB 없음).
 */
const MAX_ENTRIES = 200;
const cache = new Map<string, string>();

export function getCachedSummary(key: string): string | undefined {
  return cache.get(key);
}

export function setCachedSummary(key: string, summary: string): void {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, summary);
}
