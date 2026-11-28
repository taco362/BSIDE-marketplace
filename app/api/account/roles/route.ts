/**
 * 계정 권한 조회 (docs/architecture.md 6.5 메뉴 표시)
 * GET ?address=0x… → 200 { admin, artist } / 400 { error }
 * 헤더 메뉴를 연결된 지갑의 권한에 맞게 보이는 데만 쓴다. 화면 표시용 편의 기능이며 보안 수단이 아니다
 * (권한 확인은 각 화면의 쓰기 동작에서 컨트랙트가 한다). 공개된 온체인 정보만 돌려준다.
 */
import { getMarketReader } from "@/lib/data";
import { ChainReadError } from "@/lib/data/chain/errors";
import { accountOf } from "@/lib/domain/account";
import { isSameAddress } from "@/lib/domain/format";

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address") ?? "";
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return Response.json({ error: "지갑 주소 형식이 올바르지 않습니다." }, { status: 400 });
  }
  try {
    const reader = getMarketReader();
    const [admin, accounts] = await Promise.all([reader.getAdmin(), reader.getAccounts([address])]);
    return Response.json({
      admin: isSameAddress(admin, address),
      artist: accountOf(accounts, address).verifiedArtist,
    });
  } catch (error) {
    if (!(error instanceof ChainReadError)) console.error("[roles] 조회 실패", error);
    return Response.json({ error: "블록체인 조회에 실패했습니다." }, { status: 502 });
  }
}
