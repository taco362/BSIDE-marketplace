/**
 * 트랜잭션 진행 상태 훅 (docs/architecture.md 6.2)
 *
 * 컴포넌트는 lib/tx 함수를 "단계(step)"로 넘기기만 하고, Signer 생성·서명 대기·블록 포함 대기·오류 변환은 여기서 한다.
 * 판매 등록처럼 여러 트랜잭션(approve → list)이 필요한 동작은 단계를 순서대로 실행한다.
 * 모든 단계가 성공하면 router.refresh()로 서버 조회 결과(현재 상태)를 다시 불러온다.
 */
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ContractTransactionResponse, Signer, TransactionReceipt } from "ethers";
import { UserFacingError } from "@/lib/domain/errors";
import { toTxErrorMessage } from "@/lib/tx/errors";
import { getSigner } from "@/lib/wallet/signer";

export interface TxStep {
  /** 진행 표시에 쓰는 이름 (예: "NFT 사용 승인") */
  label: string;
  /**
   * tx(기본): MetaMask 서명이 필요한 단계 (트랜잭션 또는 메시지 서명) → "서명 대기"로 표시
   * work: 서명 없이 진행되는 작업 (예: 사진 업로드) → "처리 중"으로 표시
   */
  kind?: "tx" | "work";
  /** 트랜잭션을 보낸다. 보낼 트랜잭션이 없으면 null (예: 이미 approve된 경우, 메시지 서명·업로드 단계) */
  send: (signer: Signer) => Promise<ContractTransactionResponse | null>;
}

export type TxPhase =
  | "idle"
  | "signing" // MetaMask 서명 대기
  | "working" // 서명 없는 작업 진행 중 (업로드 등)
  | "pending" // 블록 포함 대기
  | "success"
  | "error";

export interface TxState {
  phase: TxPhase;
  /** 현재(또는 마지막) 단계 이름 */
  label: string | null;
  /** 현재 단계 번호(1부터)와 전체 단계 수 */
  step: number;
  stepCount: number;
  /** 현재 단계의 트랜잭션 해시 */
  hash: string | null;
  error: string | null;
}

const IDLE: TxState = { phase: "idle", label: null, step: 0, stepCount: 0, hash: null, error: null };

export function useTx() {
  const router = useRouter();
  const [state, setState] = useState<TxState>(IDLE);
  const busy = useRef(false);

  /** 단계를 순서대로 실행한다. 성공하면 보낸 트랜잭션의 영수증 목록, 실패하면 null */
  const run = useCallback(
    async (steps: TxStep[]): Promise<TransactionReceipt[] | null> => {
      if (busy.current) return null;
      busy.current = true;
      const stepCount = steps.length;
      try {
        const signer = await getSigner();
        const receipts: TransactionReceipt[] = [];
        for (const [index, step] of steps.entries()) {
          const base = { label: step.label, step: index + 1, stepCount, error: null };
          setState({ ...base, phase: step.kind === "work" ? "working" : "signing", hash: null });
          const tx = await step.send(signer);
          if (!tx) continue;
          setState({ ...base, phase: "pending", hash: tx.hash });
          const receipt = await tx.wait();
          if (!receipt || receipt.status !== 1) throw new Error("트랜잭션이 실패했습니다 (status 0).");
          receipts.push(receipt);
        }
        setState((s) => ({ ...s, phase: "success", error: null }));
        router.refresh();
        return receipts;
      } catch (error) {
        // 지갑·업로드 오류는 이미 사용자용 문구다. 그 외(트랜잭션·서명 거부 등)는 변환한다
        const message = error instanceof UserFacingError ? error.message : toTxErrorMessage(error);
        setState((s) => ({ ...s, phase: "error", error: message }));
        return null;
      } finally {
        busy.current = false;
      }
    },
    [router],
  );

  const reset = useCallback(() => setState(IDLE), []);

  return {
    ...state,
    busy: state.phase === "signing" || state.phase === "working" || state.phase === "pending",
    run,
    reset,
  };
}
