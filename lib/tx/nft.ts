/**
 * BSideNFT 쓰기 함수 (클라이언트 전용, docs/architecture.md 3장·6.2)
 * Signer는 hooks/useTx가 전달한다. 입력 형식은 화면에서 미리 확인하고, 최종 검증은 컨트랙트가 한다.
 */
import type { ContractTransactionResponse, Signer, TransactionReceipt } from "ethers";
import { ARTIST_ROLE, DEPLOYMENT, getNftContract } from "@/lib/contracts";
import { isSameAddress } from "@/lib/domain/format";
import { POLICIES, type Policy } from "@/lib/domain/types";

const ESCROW_ADDRESS = DEPLOYMENT.contracts.BSideEscrow.address;

export interface MintInput {
  /** ipfs://<메타데이터 CID> */
  metadataUri: string;
  /** 최초 판매가 (wei) */
  initialPrice: bigint;
  policy: Policy;
  /** PriceCap: 상한 bps, Royalty: 로열티 bps, Free: 0 */
  policyBps: number;
}

/** 발행 (ARTIST_ROLE). 연결된 계정에게 발행된다. */
export function mint(signer: Signer, input: MintInput): Promise<ContractTransactionResponse> {
  return getNftContract(signer).mint(
    input.metadataUri,
    input.initialPrice,
    POLICIES.indexOf(input.policy),
    input.policyBps,
  );
}

/** 발행 영수증의 Transfer(0 → 발행자) 이벤트에서 토큰 ID를 찾는다. */
export function mintedTokenId(receipt: TransactionReceipt): number | null {
  const iface = getNftContract(null).interface;
  for (const log of receipt.logs) {
    if (!isSameAddress(log.address, DEPLOYMENT.contracts.BSideNFT.address)) continue;
    const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
    if (parsed?.name === "Transfer" && BigInt(parsed.args.from) === BigInt(0)) return Number(parsed.args.tokenId);
  }
  return null;
}

/**
 * 판매 등록 전 에스크로에 NFT 사용 승인 (approve).
 * 이미 승인되어 있으면 트랜잭션을 보내지 않고 null을 반환한다 (등록 실패 후 재시도 시 서명 1회 절약).
 */
export async function approveEscrowIfNeeded(
  signer: Signer,
  tokenId: number,
): Promise<ContractTransactionResponse | null> {
  const nft = getNftContract(signer);
  const approved = (await nft.getApproved(tokenId)) as string;
  if (isSameAddress(approved, ESCROW_ADDRESS)) return null;
  return nft.approve(ESCROW_ADDRESS, tokenId);
}

/** 아티스트 승인 + 활동명 등록·변경 (관리자, D7) */
export function registerArtist(signer: Signer, address: string, name: string): Promise<ContractTransactionResponse> {
  return getNftContract(signer).registerArtist(address, name);
}

/** 아티스트 승인 회수 (관리자, D7). 활동명 기록은 남는다. */
export function revokeArtist(signer: Signer, address: string): Promise<ContractTransactionResponse> {
  return getNftContract(signer).revokeRole(ARTIST_ROLE, address);
}
