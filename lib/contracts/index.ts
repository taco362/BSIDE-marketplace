/**
 * 컨트랙트 주소·ABI의 단일 출처 (docs/architecture.md 3.1, 3.2)
 *
 * - abi/*.json, deployment.json은 contracts/scripts/deploy.ts가 생성한다. 직접 수정하지 않는다.
 * - Provider나 Signer를 만들지 않는다. 호출하는 쪽이 runner를 전달한다.
 *   서버 조회: lib/data/chain/provider.ts의 JsonRpcProvider
 *   트랜잭션 서명: lib/wallet/signer.ts의 Signer (6단계)
 */
import { Contract, type ContractRunner } from "ethers";
import nftAbi from "./abi/BSideNFT.json";
import escrowAbi from "./abi/BSideEscrow.json";
import deployment from "./deployment.json";

export const DEPLOYMENT = deployment;

export function getNftContract(runner: ContractRunner | null): Contract {
  return new Contract(deployment.contracts.BSideNFT.address, nftAbi, runner);
}

export function getEscrowContract(runner: ContractRunner | null): Contract {
  return new Contract(deployment.contracts.BSideEscrow.address, escrowAbi, runner);
}
