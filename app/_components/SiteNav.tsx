"use client";

import Link from "next/link";
import { useAccountRoles } from "@/hooks/useAccountRoles";
import type { AccountRoles } from "@/lib/api/account";

const LINKS: { href: string; label: string; role?: keyof AccountRoles }[] = [
  { href: "/", label: "판매 목록" },
  { href: "/my", label: "내 거래" },
  { href: "/mint", label: "NFT 발행", role: "artist" },
  { href: "/admin", label: "관리자", role: "admin" },
];

/**
 * 헤더 메뉴. 발행은 승인된 아티스트, 관리자는 관리자 지갑이 연결됐을 때만 보인다 (architecture.md 6.5).
 * 메뉴를 숨기는 것은 편의 기능이며 보안 수단이 아니다. 권한 확인은 각 화면과 컨트랙트가 한다.
 */
export function SiteNav() {
  const roles = useAccountRoles();
  return (
    <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
      {LINKS.filter((link) => !link.role || roles[link.role]).map((link) => (
        <Link key={link.href} href={link.href} className="hover:text-zinc-900 dark:hover:text-zinc-100">
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
