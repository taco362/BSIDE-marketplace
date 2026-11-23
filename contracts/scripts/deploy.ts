/**
 * BSideNFT·BSideEscrow 배포 스크립트 (docs/architecture.md 3장, progress.md 4단계)
 *
 * 수행 순서: NFT 배포 → 에스크로 배포 → setEscrow → 아티스트 등록 → ABI·주소를 lib/contracts/로 내보내기
 * NFT 발행은 하지 않는다. 발행은 scripts/mint.ts로 따로 실행한다.
 *
 * 실행
 *   로컬:   npm run node  (다른 터미널)  →  npm run deploy:local
 *
 * 환경 변수 (선택)
 *   CONFIRM_PERIOD_SECONDS  수령 승인 기한(초). 로컬 기본값 300초. 로컬이 아니면 반드시 지정해야 한다.
 *   ARTIST_ADDRESSES        아티스트로 등록할 주소 (쉼표 구분). 로컬 기본값은 계정 #1.
 */
import { artifacts, network } from "hardhat";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LOCAL_CHAIN_ID = 31337n;
const DEFAULT_LOCAL_CONFIRM_PERIOD = 300n; // 5분 (로컬 시연용)

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../lib/contracts");

const { ethers, networkName } = await network.getOrCreate();
const chainId = (await ethers.provider.getNetwork()).chainId;
const isLocal = chainId === LOCAL_CHAIN_ID;
const signers = await ethers.getSigners();
const deployer = signers[0];

// ── 배포 인자 결정 ──
const confirmPeriod = resolveConfirmPeriod();
const artistAddresses = resolveArtists();

console.log(`네트워크: ${networkName} (chainId ${chainId})`);
console.log(`배포자(관리자): ${deployer.address}`);
console.log(`수령 승인 기한: ${confirmPeriod}초`);

// ── 배포 ──
const nft = await ethers.deployContract("BSideNFT", [deployer.address]);
const nftReceipt = await nft.deploymentTransaction()!.wait();
const nftAddress = await nft.getAddress();
console.log(`BSideNFT    ${nftAddress} (block ${nftReceipt!.blockNumber})`);

const escrow = await ethers.deployContract("BSideEscrow", [deployer.address, nftAddress, confirmPeriod]);
const escrowReceipt = await escrow.deploymentTransaction()!.wait();
const escrowAddress = await escrow.getAddress();
console.log(`BSideEscrow ${escrowAddress} (block ${escrowReceipt!.blockNumber})`);

// ── 초기 설정 ──
await (await nft.getFunction("setEscrow")(escrowAddress)).wait();
console.log("setEscrow 완료 (1회만 가능)");

const ARTIST_ROLE: string = await nft.getFunction("ARTIST_ROLE")();
for (const artist of artistAddresses) {
  await (await nft.getFunction("grantRole")(ARTIST_ROLE, artist)).wait();
  console.log(`아티스트 등록: ${artist}`);
}
if (artistAddresses.length === 0) {
  console.log("등록할 아티스트가 없습니다. 필요하면 ARTIST_ADDRESSES를 지정하거나 관리자 화면에서 등록하세요.");
}

// ── 프론트엔드용 내보내기 (lib/contracts가 주소·ABI의 단일 출처) ──
await mkdir(path.join(OUT_DIR, "abi"), { recursive: true });
for (const name of ["BSideNFT", "BSideEscrow"]) {
  const { abi } = await artifacts.readArtifact(name);
  await writeFile(path.join(OUT_DIR, "abi", `${name}.json`), JSON.stringify(abi, null, 2) + "\n");
}

const deployment = {
  network: networkName,
  chainId: Number(chainId),
  deployedAt: new Date().toISOString(),
  admin: deployer.address,
  confirmPeriod: Number(confirmPeriod),
  contracts: {
    BSideNFT: { address: nftAddress, deployBlock: nftReceipt!.blockNumber },
    BSideEscrow: { address: escrowAddress, deployBlock: escrowReceipt!.blockNumber },
  },
};
await writeFile(path.join(OUT_DIR, "deployment.json"), JSON.stringify(deployment, null, 2) + "\n");
console.log(`내보내기 완료: ${path.relative(process.cwd(), OUT_DIR)}/deployment.json, abi/*.json`);

// ───────────────────────── 헬퍼 ─────────────────────────

function resolveConfirmPeriod(): bigint {
  const raw = process.env.CONFIRM_PERIOD_SECONDS;
  if (raw === undefined || raw === "") {
    if (isLocal) return DEFAULT_LOCAL_CONFIRM_PERIOD;
    // Sepolia 기한 값은 미결정 사항이므로 기본값을 두지 않는다 (proposal.md 8장)
    throw new Error("로컬이 아닌 네트워크에서는 CONFIRM_PERIOD_SECONDS를 반드시 지정해야 합니다.");
  }
  if (!/^[1-9][0-9]*$/.test(raw)) throw new Error(`CONFIRM_PERIOD_SECONDS가 올바른 양의 정수가 아닙니다: ${raw}`);
  return BigInt(raw);
}

function resolveArtists(): string[] {
  const raw = process.env.ARTIST_ADDRESSES;
  if (raw === undefined || raw.trim() === "") {
    return isLocal && signers[1] ? [signers[1].address] : [];
  }
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  for (const a of list) {
    if (!ethers.isAddress(a)) throw new Error(`ARTIST_ADDRESSES에 올바르지 않은 주소가 있습니다: ${a}`);
  }
  return list.map((a) => ethers.getAddress(a));
}
