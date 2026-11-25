import "server-only";

/**
 * 공개 IPFS 게이트웨이에서 JSON 읽기 (docs/architecture.md 6.3, 6.6)
 * - 최초 판매 상태 기록 작성 시 NFT 메타데이터의 대표 이미지 확인
 * - 거래별 상품 상태 기록 표시 (U4)
 * CID만 받는다. 온체인 값(tokenURI, conditionCID)은 누구나 정할 수 있으므로,
 * 임의의 URL을 서버가 요청하지 않도록 CID 형식이 아니면 요청하지 않는다.
 */
import { IPFS_GATEWAY } from "@/lib/config/ipfs";
import { isCid } from "@/lib/domain/upload";

const TIMEOUT_MS = 15_000;
/** JSON 최대 크기 (메타데이터·상태 기록은 수 KB 수준) */
const MAX_JSON_BYTES = 64 * 1024;

/** network: 게이트웨이 연결·응답 실패(다시 시도 가능) / format: CID 형식 아님·크기 초과·JSON 아님 */
export class GatewayError extends Error {
  constructor(
    readonly kind: "network" | "format",
    message: string,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

/** CID의 JSON을 읽는다. 실패하면 GatewayError */
export async function fetchIpfsJson(cid: string): Promise<unknown> {
  if (!isCid(cid)) throw new GatewayError("format", "CID 형식이 아닙니다.");

  let response: Response;
  try {
    response = await fetch(IPFS_GATEWAY + cid, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch (error) {
    console.error("[gateway] 요청 실패", cid, error);
    throw new GatewayError("network", "IPFS 게이트웨이에 연결하지 못했습니다.");
  }
  if (!response.ok) {
    console.error(`[gateway] HTTP ${response.status}`, cid);
    throw new GatewayError("network", `IPFS 게이트웨이가 응답하지 않았습니다 (HTTP ${response.status}).`);
  }
  if (Number(response.headers.get("content-length")) > MAX_JSON_BYTES) {
    throw new GatewayError("format", "IPFS 파일이 너무 큽니다.");
  }
  const text = await response.text();
  if (text.length > MAX_JSON_BYTES) throw new GatewayError("format", "IPFS 파일이 너무 큽니다.");
  try {
    return JSON.parse(text);
  } catch {
    throw new GatewayError("format", "IPFS 파일이 JSON 형식이 아닙니다.");
  }
}
