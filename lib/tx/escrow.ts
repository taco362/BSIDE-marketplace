/**
 * BSideEscrow 쓰기 함수 (클라이언트 전용, docs/architecture.md 4.3·6.2)
 * Signer는 hooks/useTx가 전달한다. 상태·호출자·기한 조건의 최종 검증은 컨트랙트가 한다.
 *
 * 화면 연결: list, cancelListing, buy, confirmReceipt, claimAfterTimeout, withdraw (Phase 1),
 * refundBySeller, openDispute (Phase 2, 거래 상세), resolveDispute (Phase 2, 관리자 분쟁 중재)
 */
import type { ContractTransactionResponse, Signer, TransactionReceipt } from "ethers";
import { DEPLOYMENT, getEscrowContract } from "@/lib/contracts";
import { isSameAddress } from "@/lib/domain/format";

/** 판매 등록 (사전에 lib/tx/nft.ts의 approveEscrowIfNeeded 필요) */
export function list(
  signer: Signer,
  tokenId: number,
  price: bigint,
  conditionCID: string,
): Promise<ContractTransactionResponse> {
  return getEscrowContract(signer).list(tokenId, price, conditionCID);
}

/** 판매 등록 영수증의 Listed 이벤트에서 거래 ID를 찾는다. */
export function listedListingId(receipt: TransactionReceipt): number | null {
  const iface = getEscrowContract(null).interface;
  for (const log of receipt.logs) {
    if (!isSameAddress(log.address, DEPLOYMENT.contracts.BSideEscrow.address)) continue;
    const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
    if (parsed?.name === "Listed") return Number(parsed.args.listingId);
  }
  return null;
}

/** 판매 등록 취소 (판매자, LISTED → CANCELLED, D4) */
export function cancelListing(signer: Signer, listingId: number): Promise<ContractTransactionResponse> {
  return getEscrowContract(signer).cancelListing(listingId);
}

/** 구매: 판매 가격과 같은 금액을 예치한다 (LISTED → LOCKED) */
export function buy(signer: Signer, listingId: number, price: bigint): Promise<ContractTransactionResponse> {
  return getEscrowContract(signer).buy(listingId, { value: price });
}

/** 수령 승인 (구매자, LOCKED → COMPLETED) */
export function confirmReceipt(signer: Signer, listingId: number): Promise<ContractTransactionResponse> {
  return getEscrowContract(signer).confirmReceipt(listingId);
}

/** 기한 경과 후 정산 청구 (판매자, LOCKED → COMPLETED, D2) */
export function claimAfterTimeout(signer: Signer, listingId: number): Promise<ContractTransactionResponse> {
  return getEscrowContract(signer).claimAfterTimeout(listingId);
}

/** 판매자 자발적 전액 환불 (판매자, LOCKED → CANCELLED, D4). 기한과 무관 */
export function refundBySeller(signer: Signer, listingId: number): Promise<ContractTransactionResponse> {
  return getEscrowContract(signer).refundBySeller(listingId);
}

/** 분쟁 제기 (구매자, 수령 승인 기한 전, LOCKED → DISPUTED, D5) */
export function openDispute(signer: Signer, listingId: number): Promise<ContractTransactionResponse> {
  return getEscrowContract(signer).openDispute(listingId);
}

/** 분쟁 중재 (ARBITER_ROLE, DISPUTED → CANCELLED(refundBuyer=true) 또는 COMPLETED(false), D5) */
export function resolveDispute(
  signer: Signer,
  listingId: number,
  refundBuyer: boolean,
): Promise<ContractTransactionResponse> {
  return getEscrowContract(signer).resolveDispute(listingId, refundBuyer);
}

/** 출금 대기액 전액 출금 (본인) */
export function withdraw(signer: Signer): Promise<ContractTransactionResponse> {
  return getEscrowContract(signer).withdraw();
}
