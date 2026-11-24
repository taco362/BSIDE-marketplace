import "server-only";

/**
 * 서버 조회용 JsonRpcProvider (docs/architecture.md 3.2, 7장)
 * RPC_URL은 서버 전용 환경 변수다. 브라우저로 전달하지 않는다.
 */
import { JsonRpcProvider, Network } from "ethers";
import { DEPLOYMENT } from "@/lib/contracts";
import { ChainReadError } from "./errors";

let provider: JsonRpcProvider | null = null;

export function getProvider(): JsonRpcProvider {
  if (provider) return provider;

  const url = process.env.RPC_URL;
  if (!url) {
    throw new ChainReadError("RPC_URL 환경 변수가 설정되지 않았습니다. .env.example을 참고해 .env.local에 설정하세요.");
  }
  // 네트워크는 deployment.json의 chainId로 고정한다 (staticNetwork: 연결 시 네트워크 감지 요청과 재시도를 생략)
  provider = new JsonRpcProvider(url, Network.from(DEPLOYMENT.chainId), { staticNetwork: true });
  return provider;
}
