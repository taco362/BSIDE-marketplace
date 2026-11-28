import "server-only";

/**
 * NFT 상품 이름 조회 (docs/architecture.md 6.1, 6.6)
 * 페이지가 카드마다 호출해 결과 Promise를 넘기고, 이름은 <Suspense> 안에서 따로 표시한다.
 * tokenURI가 "ipfs://<CID>"일 때만 게이트웨이에 요청한다 (임의 URL 요청 금지).
 * 오류를 던지지 않는다. 이름이 없거나 읽지 못하면 null (화면은 "NFT #n"으로 대신 표시).
 */
import { cache } from "react";
import { cidFromIpfsUri } from "@/lib/domain/conditionRecord";
import { parseTokenName } from "@/lib/domain/metadata";
import { GatewayError, fetchIpfsJson } from "@/lib/ipfs/gateway";

/** 같은 요청 안에서 같은 tokenURI는 한 번만 읽는다 */
export const getTokenName = cache(async (tokenURI: string): Promise<string | null> => {
  const cid = cidFromIpfsUri(tokenURI);
  if (!cid) return null;
  try {
    return parseTokenName(await fetchIpfsJson(cid));
  } catch (error) {
    if (!(error instanceof GatewayError)) console.error("[tokenMetadata] 예상하지 못한 오류", cid, error);
    return null;
  }
});
