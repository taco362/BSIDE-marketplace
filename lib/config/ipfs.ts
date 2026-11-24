/**
 * 공개 IPFS 게이트웨이 설정 (비밀값 아님)
 */
export const IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs/";

/** "ipfs://<CID>[/path]" 또는 "<CID>" → 게이트웨이 URL. 그 외 형식(http 등)은 그대로 반환 */
export function ipfsToUrl(uriOrCid: string): string {
  if (uriOrCid.startsWith("ipfs://")) return IPFS_GATEWAY + uriOrCid.slice("ipfs://".length);
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(uriOrCid)) return uriOrCid;
  return IPFS_GATEWAY + uriOrCid;
}
