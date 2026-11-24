/**
 * 지갑 연결 상태 훅 (docs/architecture.md 3장)
 *
 * 연결 상태는 모듈 단위 외부 저장소 하나로 관리하고 useSyncExternalStore로 구독한다.
 * - 모든 컴포넌트가 같은 상태를 보므로 별도의 Context Provider가 필요 없다.
 * - 서버 렌더링과 hydration 중에는 "checking" 상태를 사용하므로 서버/클라이언트 출력이 일치한다.
 * - MetaMask의 accountsChanged·chainChanged 이벤트로 계정·네트워크 변경을 반영한다.
 */
import { useSyncExternalStore } from "react";
import {
  EXPECTED_CHAIN_ID,
  getAccounts,
  getChainId,
  getEthereum,
  parseChainId,
  requestAccounts,
  switchToExpectedChain,
  toWalletError,
} from "@/lib/wallet/signer";

export type WalletStatus =
  | "checking" // 초기 확인 중 (서버 렌더링 포함)
  | "unavailable" // MetaMask 없음
  | "disconnected" // 연결된 계정 없음
  | "connected";

interface WalletSnapshot {
  status: WalletStatus;
  account: string | null;
  chainId: number | null;
  /** 진행 중인 지갑 요청 */
  pending: "connect" | "switch" | null;
  /** 마지막 지갑 요청의 오류 메시지 */
  error: string | null;
}

const INITIAL_SNAPSHOT: WalletSnapshot = {
  status: "checking",
  account: null,
  chainId: null,
  pending: null,
  error: null,
};

let snapshot: WalletSnapshot = INITIAL_SNAPSHOT;
const listeners = new Set<() => void>();
let started = false;

function update(patch: Partial<WalletSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

function accountsPatch(accounts: string[]): Partial<WalletSnapshot> {
  const account = accounts[0] ?? null;
  return { status: account ? "connected" : "disconnected", account };
}

/** 첫 구독 시 1회: 현재 계정·체인 조회, 지갑 이벤트 등록 */
function start() {
  if (started) return;
  started = true;

  const ethereum = getEthereum();
  if (!ethereum) {
    update({ status: "unavailable" });
    return;
  }
  ethereum.on("accountsChanged", (accounts) => update(accountsPatch(accounts)));
  ethereum.on("chainChanged", (chainIdHex) => update({ chainId: parseChainId(chainIdHex) }));

  Promise.all([getAccounts(), getChainId()])
    .then(([accounts, chainId]) => update({ ...accountsPatch(accounts), chainId }))
    .catch((error) => update({ status: "disconnected", error: toWalletError(error).message }));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
  };
}

async function connect() {
  if (snapshot.pending) return;
  update({ pending: "connect", error: null });
  try {
    const accounts = await requestAccounts();
    const chainId = await getChainId();
    update({ ...accountsPatch(accounts), chainId, pending: null });
  } catch (error) {
    update({ pending: null, error: toWalletError(error).message });
  }
}

async function switchNetwork() {
  if (snapshot.pending) return;
  update({ pending: "switch", error: null });
  try {
    await switchToExpectedChain();
    update({ chainId: await getChainId(), pending: null });
  } catch (error) {
    update({ pending: null, error: toWalletError(error).message });
  }
}

export function useWallet() {
  const state = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => INITIAL_SNAPSHOT,
  );
  return {
    ...state,
    expectedChainId: EXPECTED_CHAIN_ID,
    /** 연결된 네트워크가 앱이 사용하는 체인인지 (연결 전에는 false) */
    isCorrectChain: state.chainId === EXPECTED_CHAIN_ID,
    connect,
    switchNetwork,
  };
}
