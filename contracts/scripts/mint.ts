/**
 * NFT 발행 스크립트 — 배포와 분리되어 있다 (docs/architecture.md 4.5)
 *
 * lib/contracts/deployment.json의 BSideNFT 주소로, 아티스트 계정이 NFT 1개를 발행한다.
 * 메타데이터는 Pinata에 업로드한 실제 CID를 사용한다. 발행 후 메타데이터 URI와 정책은 변경할 수 없다.
 *
 * 환경 변수 (필수)
 *   METADATA_URI       예: ipfs://<메타데이터 JSON CID>
 *   INITIAL_PRICE_ETH  최초 판매가 (ETH 단위, 예: 0.01)
 *   POLICY             PriceCap | Royalty | Free
 *   POLICY_BPS         PriceCap: 10000~15000, Royalty: 100~1000, Free: 0 (생략 시 0)
 * 환경 변수 (선택)
 *   ARTIST_SIGNER_INDEX  발행에 사용할 계정 번호. 로컬 기본값 1(배포 스크립트가 등록한 아티스트), 그 외 0
 *
 * 실행 (PowerShell 예시)
 *   $env:METADATA_URI="ipfs://..."; $env:INITIAL_PRICE_ETH="0.01"; $env:POLICY="Royalty"; $env:POLICY_BPS="500"
 *   npm run mint:local
 */
import { network } from "hardhat";
import { readDeployment } from "./lib/deployment.js";
import { POLICIES, readMintArgs } from "./lib/env.js";

const { ethers, networkName } = await network.getOrCreate();
const chainId = Number((await ethers.provider.getNetwork()).chainId);

const args = readMintArgs();
const deployment = await readDeployment(chainId, networkName);

const signers = await ethers.getSigners();
const signerIndex = Number(process.env.ARTIST_SIGNER_INDEX ?? (chainId === 31337 ? "1" : "0"));
const artist = signers[signerIndex];
if (!artist) throw new Error(`ARTIST_SIGNER_INDEX ${signerIndex}에 해당하는 계정이 없습니다.`);

const nft = await ethers.getContractAt("BSideNFT", deployment.contracts.BSideNFT.address, artist);

console.log(`네트워크: ${networkName} (chainId ${chainId})`);
console.log(`아티스트: ${artist.address}`);
console.log(`메타데이터: ${args.metadataUri}`);
console.log(`최초 판매가: ${ethers.formatEther(args.initialPrice)} ETH, 정책: ${args.policyName} (${args.policyBps} bps)`);

const receipt = await (
  await nft.mint(args.metadataUri, args.initialPrice, POLICIES[args.policyName], args.policyBps)
).wait();
const tokenId = await nft.totalMinted();
console.log(`발행 완료: tokenId ${tokenId} (block ${receipt!.blockNumber})`);
