import "server-only";

/**
 * AI 호출 횟수 제한 (docs/architecture.md 6.7 A3)
 * 서명 없이 누구나 부를 수 있는 이력 요약 API가 무료 사용량을 한꺼번에 써 버리지 않게, 1분당 호출 수를 제한한다.
 * 한계: 서버 인스턴스마다 따로 센다 (DB 없음). 최종 한도는 Gemini 무료 등급 자체 한도다.
 */
const WINDOW_MS = 60_000;
const MAX_CALLS_PER_WINDOW = 10;
let windowStart = 0;
let calls = 0;

/** 호출할 수 있으면 횟수를 세고 true, 한도를 넘으면 false */
export function takeAiCall(now = Date.now()): boolean {
  if (now - windowStart >= WINDOW_MS) {
    windowStart = now;
    calls = 0;
  }
  if (calls >= MAX_CALLS_PER_WINDOW) return false;
  calls += 1;
  return true;
}
