/**
 * 브라우저 지갑(MetaMask, EIP-1193) 접근 (docs/architecture.md 3.2)
 * 클라이언트 컴포넌트·훅에서만 사용한다 (window.ethereum).
 *
 * 5단계: 계정 조회·연결 요청·네트워크 확인·전환
 * 6단계: 트랜잭션 서명용 BrowserProvider·Signer를 이 파일에 추가한다.
 * 브라우저는 MetaMask가 연결한 노드를 사용하므로 RPC 주소를 알 필요가 없다.
 */
import { DEPLOYMENT } from "@/lib/contracts";

/** 이 앱이 사용하는 체인 (deployment.json 기준: 로컬 31337 / Sepolia 11155111) */
export const EXPECTED_CHAIN_ID: number = DEPLOYMENT.chainId;

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on(event: "accountsChanged", listener: (accounts: string[]) => void): void;
  on(event: "chainChanged", listener: (chainIdHex: string) => void): void;
  removeListener(event: string, listener: (...args: never[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export function getEthereum(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  return window.ethereum ?? null;
}

function requireEthereum(): Eip1193Provider {
  const ethereum = getEthereum();
  if (!ethereum) throw new WalletError("MetaMask가 설치되어 있지 않습니다.");
  return ethereum;
}

export class WalletError extends Error {}

/** 사용자에게 보여줄 오류 메시지로 변환 */
export function toWalletError(error: unknown): WalletError {
  if (error instanceof WalletError) return error;
  const code = (error as { code?: number } | null)?.code;
  if (code === 4001) return new WalletError("MetaMask에서 요청이 거부되었습니다.");
  if (code === -32002) return new WalletError("MetaMask에 처리 대기 중인 요청이 있습니다. MetaMask 창을 확인하세요.");
  if (code === 4902) {
    return new WalletError(`MetaMask에 chainId ${EXPECTED_CHAIN_ID} 네트워크가 없습니다. 먼저 네트워크를 추가하세요.`);
  }
  const message = (error as { message?: string } | null)?.message;
  return new WalletError(message ? `지갑 요청 실패: ${message}` : "지갑 요청에 실패했습니다.");
}

/** 연결 요청 없이 이미 허용된 계정만 조회 */
export async function getAccounts(): Promise<string[]> {
  return (await requireEthereum().request({ method: "eth_accounts" })) as string[];
}

/** MetaMask 연결 요청 (사용자 승인 창이 열린다) */
export async function requestAccounts(): Promise<string[]> {
  return (await requireEthereum().request({ method: "eth_requestAccounts" })) as string[];
}

export async function getChainId(): Promise<number> {
  return parseChainId((await requireEthereum().request({ method: "eth_chainId" })) as string);
}

export function parseChainId(chainIdHex: string): number {
  return Number.parseInt(chainIdHex, 16);
}

/** 앱이 사용하는 체인으로 전환 요청 */
export async function switchToExpectedChain(): Promise<void> {
  await requireEthereum().request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: `0x${EXPECTED_CHAIN_ID.toString(16)}` }],
  });
}
