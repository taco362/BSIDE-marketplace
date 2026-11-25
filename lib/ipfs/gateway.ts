import "server-only";

/**
 * 공개 IPFS 게이트웨이에서 JSON 읽기 (docs/architecture.md 6.3)
 * 최초 판매 상태 기록을 만들 때 NFT 메타데이터의 대표 이미지를 확인하는 데 쓴다.
 */
import { ipfsToUrl } from "@/lib/config/ipfs";

const TIMEOUT_MS = 15_000;
/** 메타데이터 JSON 최대 크기 (이름 100자 + 설명 1000자 수준이면 충분) */
const MAX_JSON_BYTES = 64 * 1024;

export class GatewayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GatewayError";
  }
}

/** "ipfs://<CID>" 또는 "<CID>"의 JSON을 읽는다. 연결 실패·크기 초과·JSON 아님이면 GatewayError */
export async function fetchIpfsJson(uriOrCid: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(ipfsToUrl(uriOrCid), { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch (error) {
    console.error("[gateway] 요청 실패", uriOrCid, error);
    throw new GatewayError("IPFS 게이트웨이에 연결하지 못했습니다.");
  }
  if (!response.ok) {
    console.error(`[gateway] HTTP ${response.status}`, uriOrCid);
    throw new GatewayError(`IPFS 게이트웨이가 응답하지 않았습니다 (HTTP ${response.status}).`);
  }
  if (Number(response.headers.get("content-length")) > MAX_JSON_BYTES) {
    throw new GatewayError("IPFS 파일이 너무 큽니다.");
  }
  const text = await response.text();
  if (text.length > MAX_JSON_BYTES) throw new GatewayError("IPFS 파일이 너무 큽니다.");
  try {
    return JSON.parse(text);
  } catch {
    throw new GatewayError("IPFS 파일이 JSON 형식이 아닙니다.");
  }
}
