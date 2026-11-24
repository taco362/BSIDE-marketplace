/**
 * 로컬 테스트 데이터 스크립트 — 로컬 Hardhat 노드(chainId 31337) 전용 (docs/architecture.md 4.5)
 *
 * 아티스트(계정 #1)가 NFT 1개를 발행하고, 최초 판매가로 바로 판매 등록한다 (approve → list).
 * 배포 직후 1회 실행하는 용도다. 보통 `npm run setup:local`(배포 + 이 스크립트)로 실행한다.
 * CID는 Pinata에 업로드한 실제 CID를 사용한다 (가짜 CID 사용 금지, architecture.md 6.4).
 *
 * 환경 변수 (필수)
 *   METADATA_URI    ipfs://<메타데이터 JSON CID>
 *   CONDITION_CID   상품 상태 기록 JSON CID (ipfs:// 없이 CID만)
 * 환경 변수 (선택, 로컬 기본값)
 *   INITIAL_PRICE_ETH 0.05 / POLICY PriceCap / POLICY_BPS 12000
 */
import { network } from "hardhat";
import { readDeployment } from "./lib/deployment.js";
import { POLICIES, readMintArgs, requireEnv } from "./lib/env.js";

const LOCAL_CHAIN_ID = 31337;

const { ethers, networkName } = await network.getOrCreate();
const chainId = Number((await ethers.provider.getNetwork()).chainId);
if (chainId !== LOCAL_CHAIN_ID) {
  throw new Error(`seed는 로컬 노드(chainId ${LOCAL_CHAIN_ID}) 전용입니다. 현재: ${networkName}(chainId ${chainId})`);
}

const args = readMintArgs({ initialPriceEth: "0.05", policy: "PriceCap", policyBps: "12000" });
const conditionCid = requireEnv("CONDITION_CID");
if (conditionCid.startsWith("ipfs://") || /\s/.test(conditionCid)) {
  throw new Error(`CONDITION_CID는 ipfs:// 없이 CID만 입력합니다: ${conditionCid}`);
}
const deployment = await readDeployment(chainId, networkName);

const [, artist] = await ethers.getSigners();
const nftAddress = deployment.contracts.BSideNFT.address;
const escrowAddress = deployment.contracts.BSideEscrow.address;
const nft = await ethers.getContractAt("BSideNFT", nftAddress, artist);
const escrow = await ethers.getContractAt("BSideEscrow", escrowAddress, artist);

console.log(`아티스트: ${artist.address}`);
console.log(`최초 판매가: ${ethers.formatEther(args.initialPrice)} ETH, 정책: ${args.policyName} (${args.policyBps} bps)`);

await (await nft.mint(args.metadataUri, args.initialPrice, POLICIES[args.policyName], args.policyBps)).wait();
const tokenId = await nft.totalMinted();
console.log(`발행 완료: tokenId ${tokenId} (${args.metadataUri})`);

// 최초 판매: 판매가 = 최초 판매가 (D1)
await (await nft.approve(escrowAddress, tokenId)).wait();
await (await escrow.list(tokenId, args.initialPrice, conditionCid)).wait();
const listingId = await escrow.listingCount();
console.log(`판매 등록 완료: 거래 #${listingId} (상태 기록 ${conditionCid})`);
console.log(`확인: http://localhost:3000/listings/${listingId}`);
