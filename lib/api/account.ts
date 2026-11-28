/**
 * 계정 권한 조회 요청 (클라이언트 전용, docs/architecture.md 6.5 메뉴 표시)
 * GET /api/account/roles → { admin, artist }. 실패하면 null (메뉴는 권한 메뉴 없이 표시)
 */
export interface AccountRoles {
  admin: boolean;
  artist: boolean;
}

export async function fetchAccountRoles(address: string): Promise<AccountRoles | null> {
  try {
    const response = await fetch(`/api/account/roles?address=${encodeURIComponent(address)}`, { cache: "no-store" });
    if (!response.ok) return null;
    const body = (await response.json()) as Partial<AccountRoles>;
    return { admin: body.admin === true, artist: body.artist === true };
  } catch {
    return null;
  }
}
