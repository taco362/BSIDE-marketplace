"use client";

import type { ReactNode } from "react";
import { isSameAddress } from "@/lib/domain/format";
import { NetworkGuard } from "./NetworkGuard";

/**
 * 권한 화면 보호 (architecture.md 6.5): 연결된 지갑이 allowed에 있을 때만 children을 보인다.
 * 주소를 직접 입력해 들어온 일반 사용자에게 폼·목록 대신 안내만 보이기 위한 편의 기능이다.
 * 로그인이 없어 서버는 접속자를 모르므로 완전한 접근 차단은 아니다. 쓰기 권한은 컨트랙트가 확인한다.
 */
export function RoleGate({
  allowed,
  deniedMessage,
  children,
}: {
  /** 이 화면을 쓸 수 있는 지갑 주소 (서버가 체인에서 읽어 넘긴다) */
  allowed: string[];
  deniedMessage: string;
  children: ReactNode;
}) {
  return (
    <NetworkGuard>
      {(account) =>
        allowed.some((a) => isSameAddress(a, account)) ? (
          children
        ) : (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            {deniedMessage}
          </p>
        )
      }
    </NetworkGuard>
  );
}
