import Link from "next/link";

const LINKS = [
  { href: "/", label: "판매 목록" },
  { href: "/my", label: "내 거래" },
  { href: "/mint", label: "NFT 발행" },
  { href: "/admin", label: "관리자" },
] as const;

/** 헤더 메뉴. 권한 확인은 각 화면과 컨트랙트가 한다 (메뉴를 숨기는 것은 보안 수단이 아님) */
export function SiteNav() {
  return (
    <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} className="hover:text-zinc-900 dark:hover:text-zinc-100">
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
