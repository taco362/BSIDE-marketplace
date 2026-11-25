import "server-only";

/**
 * 등록된 아티스트 목록 (D7, 관리자 화면·발행 화면용)
 * registerArtist가 남기는 ArtistRegistered 이벤트로 등록된 적이 있는 주소를 모으고,
 * 현재 활동명·승인 여부는 accounts.ts로 조회한다 (회수된 아티스트도 verifiedArtist=false로 포함).
 * grantRole로만 승인된 주소는 이벤트가 없어 목록에 나오지 않는다 (architecture.md 4.1: 사용하지 않는 경로).
 */
import { connection } from "next/server";
import { DEPLOYMENT, getNftContract } from "@/lib/contracts";
import { uniqueAddresses } from "@/lib/domain/account";
import type { AccountProfile } from "@/lib/domain/types";
import { readAccounts } from "./accounts";
import { getLogsInRanges } from "./logs";
import { getProvider } from "./provider";

/** 처음 등록된 순서 */
export async function readArtists(): Promise<AccountProfile[]> {
  await connection();
  const iface = getNftContract(getProvider()).interface;
  const event = iface.getEvent("ArtistRegistered");
  if (!event) throw new Error("ABI에 ArtistRegistered 이벤트가 없습니다.");

  const { address, deployBlock } = DEPLOYMENT.contracts.BSideNFT;
  const logs = await getLogsInRanges(address, deployBlock, [[event.topicHash]]);
  const addresses = uniqueAddresses(
    logs.map((log) => iface.parseLog({ topics: [...log.topics], data: log.data })?.args.artist as string | undefined),
  );
  const directory = await readAccounts(addresses);
  return addresses.map((a) => directory[a.toLowerCase()]);
}
