"use client";

import { useEffect } from "react";

const IS_DEV = process.env.NODE_ENV === "development";

/**
 * 조회 실패(RPC 연결 불가, RPC_URL 미설정 등) 시 표시
 * - 개발 모드: 오류 원인을 함께 보여준다. 조회 오류는 서버에서 민감 정보(RPC 주소·API 키 등)가 없는
 *   안내 문구로 바뀐 뒤 전달된다 (lib/data/chain/errors.ts).
 * - 프로덕션: Next.js가 서버 오류 메시지를 숨기므로 서버 로그 확인용 식별자(digest)만 보여준다.
 */
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const message = error instanceof globalThis.Error ? error.message : null;
  const digest = (error as { digest?: string } | null)?.digest;

  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="text-xl font-semibold">데이터를 불러오지 못했습니다</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        블록체인 노드에 연결할 수 없거나 서버 설정이 올바르지 않을 수 있습니다. 잠시 후 다시 시도하세요.
      </p>
      {IS_DEV && message && (
        <div className="w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-medium">개발 모드 오류 원인</p>
          <p className="break-words">{message}</p>
        </div>
      )}
      {!IS_DEV && digest && <p className="font-mono text-xs text-zinc-500">오류 식별자: {digest}</p>}
      <button
        type="button"
        onClick={() => retry()}
        className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
      >
        다시 시도
      </button>
    </div>
  );
}
