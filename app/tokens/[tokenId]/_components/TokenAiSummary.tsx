"use client";

import { useState } from "react";
import { requestTokenSummary } from "@/lib/api/ai";
import { UserFacingError } from "@/lib/domain/errors";

type State =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; summary: string; ai: boolean }
  | { phase: "error"; message: string };

/**
 * AI 거래 이력 요약 (architecture.md 6.7 A3, D14)
 * 버튼을 눌렀을 때만 요청한다 (비용 절약). 지갑이 필요 없다.
 */
export function TokenAiSummary({ tokenId }: { tokenId: number }) {
  const [state, setState] = useState<State>({ phase: "idle" });

  async function onClick() {
    setState({ phase: "loading" });
    try {
      setState({ phase: "done", ...(await requestTokenSummary(tokenId)) });
    } catch (error) {
      setState({
        phase: "error",
        message: error instanceof UserFacingError ? error.message : "AI 요약을 받지 못했습니다.",
      });
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-2">
      {state.phase === "done" ? (
        <div className="flex flex-col gap-1.5 rounded-lg border border-violet-200 bg-violet-50/50 p-3 dark:border-violet-900 dark:bg-violet-950/30">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{state.summary}</p>
          {state.ai && (
            <p className="text-xs text-zinc-500">
              ✨ AI(Google Gemini)가 아래 거래 기록으로 작성한 참고용 요약입니다. 가격·횟수·경고는 아래 기록이 기준입니다.
            </p>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={onClick}
          disabled={state.phase === "loading"}
          className="self-start rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          {state.phase === "loading" ? "AI 요약 작성 중…" : "✨ AI 요약 보기"}
        </button>
      )}
      {state.phase === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}
    </div>
  );
}
