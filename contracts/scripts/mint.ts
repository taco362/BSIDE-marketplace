/**
 * NFT 발행 스크립트 — 배포와 분리되어 있다 (docs/progress.md 4단계)
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
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const POLICIES = { PriceCap: 0, Royalty: 1, Free: 2 } as const;
type PolicyName = keyof typeof POLICIES;

const DEPLOYMENT_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../lib/contracts/deployment.json",
);

const { ethers, networkName } = await network.getOrCreate();
const chainId = Number((await ethers.provider.getNetwork()).chainId);

// ── 입력 검증 (컨트랙트 검증 전에 명확한 안내를 주기 위함. 최종 검증은 컨트랙트가 한다) ──
const metadataUri = requireEnv("METADATA_URI");
if (!metadataUri.startsWith("ipfs://") || metadataUri.length <= "ipfs://".length) {
  throw new Error(`METADATA_URI는 ipfs://<CID> 형식이어야 합니다: ${metadataUri}`);
}
const initialPrice = ethers.parseEther(requireEnv("INITIAL_PRICE_ETH"));
const policyName = requireEnv("POLICY") as PolicyName;
if (!(policyName in POLICIES)) throw new Error(`POLICY는 PriceCap, Royalty, Free 중 하나여야 합니다: ${policyName}`);
const policyBps = Number(process.env.POLICY_BPS ?? "0");

// ── 배포 정보 확인 ──
const deployment = JSON.parse(await readFile(DEPLOYMENT_FILE, "utf8"));
if (deployment.chainId !== chainId) {
  throw new Error(
    `deployment.json은 chainId ${deployment.chainId}용입니다. 현재 네트워크 ${networkName}(chainId ${chainId})에 먼저 배포하세요.`,
  );
}

const signers = await ethers.getSigners();
const signerIndex = Number(process.env.ARTIST_SIGNER_INDEX ?? (chainId === 31337 ? "1" : "0"));
const artist = signers[signerIndex];
if (!artist) throw new Error(`ARTIST_SIGNER_INDEX ${signerIndex}에 해당하는 계정이 없습니다.`);

const nft = await ethers.getContractAt("BSideNFT", deployment.contracts.BSideNFT.address, artist);

console.log(`네트워크: ${networkName} (chainId ${chainId})`);
console.log(`아티스트: ${artist.address}`);
console.log(`메타데이터: ${metadataUri}`);
console.log(`최초 판매가: ${ethers.formatEther(initialPrice)} ETH, 정책: ${policyName} (${policyBps} bps)`);

const receipt = await (await nft.mint(metadataUri, initialPrice, POLICIES[policyName], policyBps)).wait();
const tokenId = await nft.totalMinted();
console.log(`발행 완료: tokenId ${tokenId} (block ${receipt!.blockNumber})`);

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`환경 변수 ${name}가 필요합니다.`);
  return value;
}
