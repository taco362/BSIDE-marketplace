/**
 * 연결된 지갑의 권한 (docs/architecture.md 6.5 메뉴 표시)
 * 연결 계정이 바뀔 때 조회한다. 승인·회수 결과는 새로고침하거나 계정을 다시 연결하면 반영된다.
 * (헤더는 모든 화면에 있으므로 usePathname을 쓰면 Cache Components에서 정적 렌더링이 막힌다. 그래서 화면 이동 시 다시 조회하지 않는다)
 * 메뉴 표시용 편의 기능이다. 권한 확인은 컨트랙트가 한다.
 */
import { useEffect, useState } from "react";
import { fetchAccountRoles, type AccountRoles } from "@/lib/api/account";
import { useWallet } from "./useWallet";

const NO_ROLES: AccountRoles = { admin: false, artist: false };

export function useAccountRoles(): AccountRoles {
  const { account } = useWallet();
  const [result, setResult] = useState<{ account: string; roles: AccountRoles } | null>(null);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    fetchAccountRoles(account).then((roles) => {
      if (!cancelled) setResult({ account, roles: roles ?? NO_ROLES });
    });
    return () => {
      cancelled = true;
    };
  }, [account]);

  // 다른 계정의 이전 결과는 쓰지 않는다 (계정 전환 직후 잠깐 권한 메뉴가 남지 않게)
  return account && result?.account === account ? result.roles : NO_ROLES;
}
