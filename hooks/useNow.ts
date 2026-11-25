/**
 * 현재 시각(초) 훅: 수령 승인 기한 경과 여부를 화면에 표시하는 용도
 * 서버 렌더링·hydration 중에는 null(알 수 없음)을 쓰므로 서버/클라이언트 출력이 일치한다.
 * 기한 판정의 기준은 블록 시각이며 최종 판정은 컨트랙트가 한다 (architecture.md 4.3).
 */
import { useSyncExternalStore } from "react";

const TICK_MS = 1000;

let now = Math.floor(Date.now() / 1000);
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    now = Math.floor(Date.now() / 1000);
    timer = setInterval(() => {
      now = Math.floor(Date.now() / 1000);
      for (const l of listeners) l();
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useNow(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => null,
  );
}
