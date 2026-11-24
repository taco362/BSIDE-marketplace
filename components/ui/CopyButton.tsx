"use client";

import { useState } from "react";

/** 텍스트 복사 버튼 (예: 전체 지갑 주소) */
export function CopyButton({ text, label = "복사" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 권한이 없으면 아무것도 하지 않는다 (주소는 화면에 그대로 보인다)
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="rounded border border-zinc-300 px-1.5 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
    >
      {copied ? "복사됨" : label}
    </button>
  );
}
