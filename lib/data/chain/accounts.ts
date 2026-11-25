import "server-only";

/**
 * 계정 표시 정보 조회 (D7): 관리자가 등록한 활동명(artistName)과 현재 아티스트 권한(hasRole)
 */
import { connection } from "next/server";
import { ARTIST_ROLE, getNftContract } from "@/lib/contracts";
import { uniqueAddresses } from "@/lib/domain/account";
import type { AccountDirectory } from "@/lib/domain/types";
import { getProvider } from "./provider";

export async function readAccounts(addresses: (string | null | undefined)[]): Promise<AccountDirectory> {
  const targets = uniqueAddresses(addresses);
  if (targets.length === 0) return {};
  await connection();

  const nft = getNftContract(getProvider());
  const rows = await Promise.all(
    targets.map(async (address) => {
      const [name, verified] = (await Promise.all([
        nft.artistName(address),
        nft.hasRole(ARTIST_ROLE, address),
      ])) as [string, boolean];
      return { address, artistName: name === "" ? null : name, verifiedArtist: verified };
    }),
  );
  return Object.fromEntries(rows.map((row) => [row.address.toLowerCase(), row]));
}
