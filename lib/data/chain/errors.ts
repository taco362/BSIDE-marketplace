import "server-only";

/**
 * 조회 오류 → 화면에 보여줘도 안전한 오류 (docs/architecture.md 6.1, 7장)
 *
 * 원본 오류 메시지는 화면으로 보내지 않는다. ethers 오류 메시지에는 요청 URL(RPC_URL, API 키 포함 가능)이나
 * 응답 본문이 들어갈 수 있기 때문이다. 오류 종류만 판별해 미리 정한 안내 문구로 바꾼다.
 * 원본 오류는 서버 로그에만 남긴다.
 */
import { isError } from "ethers";

export class ChainReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChainReadError";
  }
}

const NETWORK_ERROR_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "ECONNRESET", "EAI_AGAIN", "ETIMEDOUT"]);

/** 오류 객체와 그 원인(cause, error)에서 Node 네트워크 오류 코드를 찾는다. */
function findNetworkErrorCode(error: unknown, depth = 0): string | null {
  if (!error || typeof error !== "object" || depth > 3) return null;
  const e = error as { code?: unknown; cause?: unknown; error?: unknown };
  if (typeof e.code === "string" && NETWORK_ERROR_CODES.has(e.code)) return e.code;
  return findNetworkErrorCode(e.cause, depth + 1) ?? findNetworkErrorCode(e.error, depth + 1);
}

export function toChainReadError(error: unknown): ChainReadError {
  if (error instanceof ChainReadError) return error;

  const networkCode = findNetworkErrorCode(error);
  if (networkCode) {
    return new ChainReadError(
      `RPC 노드에 연결할 수 없습니다 (${networkCode}). 노드가 실행 중인지, RPC_URL이 올바른지 확인하세요. 로컬: contracts에서 npm run node`,
    );
  }
  if (isError(error, "BAD_DATA") && error.value === "0x") {
    return new ChainReadError(
      "배포 주소에 컨트랙트가 없습니다. 로컬 노드를 재시작했다면 다시 배포하세요 (contracts에서 npm run setup:local). RPC_URL이 deployment.json의 네트워크와 같은지도 확인하세요.",
    );
  }
  if (isError(error, "CALL_EXCEPTION")) {
    return new ChainReadError(
      "컨트랙트 조회 호출이 실패했습니다 (CALL_EXCEPTION). deployment.json과 RPC_URL이 같은 네트워크인지 확인하세요.",
    );
  }
  if (isError(error, "TIMEOUT")) {
    return new ChainReadError("RPC 응답 시간이 초과되었습니다 (TIMEOUT). 잠시 후 다시 시도하세요.");
  }
  if (isError(error, "SERVER_ERROR")) {
    return new ChainReadError("RPC 서버가 오류를 반환했습니다 (SERVER_ERROR). RPC_URL과 RPC 제공자 상태를 확인하세요.");
  }
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && /^[A-Z_]+$/.test(code)) {
    return new ChainReadError(`블록체인 조회에 실패했습니다 (${code}). 자세한 내용은 서버 로그를 확인하세요.`);
  }
  return new ChainReadError("블록체인 조회 중 알 수 없는 오류가 발생했습니다. 자세한 내용은 서버 로그를 확인하세요.");
}
