/**
 * BSideNFT·BSideEscrow 배포 스크립트 (docs/architecture.md 3장, progress.md 4단계)
 *
 * 수행 순서: NFT 배포 → 에스크로 배포 → setEscrow → 아티스트 등록 → ABI·주소를 lib/contracts/로 내보내기
 * NFT 발행은 하지 않는다. 발행은 scripts/mint.ts로 따로 실행한다.
 *
 * 실행
 *   로컬:   npm run node  (다른 터미널)  →  npm run deploy:local
 *   Sepolia: CONFIRM_PERIOD_SECONDS=300 npm run deploy:sepolia  (keystore에 SEPOLIA_RPC_URL·SEPOLIA_PRIVATE_KEY 필요)
 *
 * 환경 변수 (선택)
 *   CONFIRM_PERIOD_SECONDS  수령 승인 기한(초). 로컬 기본값 300초. 로컬이 아니면 반드시 지정해야 한다.
 *   ARTIST_ADDRESSES        아티스트로 등록할 주소 (쉼표 구분). 로컬 기본값은 계정 #1.
 *   ARTIST_NAMES            아티스트 활동명 (쉼표 구분, ARTIST_ADDRESSES와 같은 순서·개수). 로컬 기본값 "로컬 테스트 아티스트".
 *                           아티스트는 registerArtist(주소, 활동명)로 등록한다 (D7). grantRole은 사용하지 않는다.
 */
import { artifacts, network } from "hardhat";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LOCAL_CHAIN_ID = 31337n;
const DEFAULT_LOCAL_CONFIRM_PERIOD = 300n; // 5분 (로컬 시연용)
const DEFAULT_LOCAL_ARTIST_NAME = "로컬 테스트 아티스트";
const MAX_ARTIST_NAME_BYTES = 64; // BSideNFT.MAX_ARTIST_NAME_BYTES

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../lib/contracts");

const { ethers, networkName } = await network.getOrCreate();
const chainId = (await ethers.provider.getNetwork()).chainId;
const isLocal = chainId === LOCAL_CHAIN_ID;
const signers = await ethers.getSigners();
const deployer = signers[0];

// ── 배포 인자 결정 ──
const confirmPeriod = resolveConfirmPeriod();
const artists = resolveArtists();

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

for (const { address, name } of artists) {
  await (await nft.getFunction("registerArtist")(address, name)).wait();
  console.log(`아티스트 등록: ${address} (${name})`);
}
if (artists.length === 0) {
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
    // 네트워크마다 값을 명시하도록 기본값을 두지 않는다 (Sepolia 시연 값 300초, proposal.md FR-05)
    throw new Error("로컬이 아닌 네트워크에서는 CONFIRM_PERIOD_SECONDS를 반드시 지정해야 합니다.");
  }
  if (!/^[1-9][0-9]*$/.test(raw)) throw new Error(`CONFIRM_PERIOD_SECONDS가 올바른 양의 정수가 아닙니다: ${raw}`);
  return BigInt(raw);
}

function resolveArtists(): { address: string; name: string }[] {
  const rawAddresses = process.env.ARTIST_ADDRESSES?.trim() ?? "";
  const rawNames = process.env.ARTIST_NAMES?.trim() ?? "";
  if (rawAddresses === "") {
    if (rawNames !== "") throw new Error("ARTIST_NAMES를 쓰려면 ARTIST_ADDRESSES도 지정해야 합니다.");
    return isLocal && signers[1] ? [{ address: signers[1].address, name: DEFAULT_LOCAL_ARTIST_NAME }] : [];
  }

  const addresses = rawAddresses.split(",").map((s) => s.trim()).filter(Boolean);
  const names = rawNames.split(",").map((s) => s.trim()).filter(Boolean);
  if (names.length !== addresses.length) {
    throw new Error(
      `ARTIST_NAMES(${names.length}개)는 ARTIST_ADDRESSES(${addresses.length}개)와 개수가 같아야 합니다. 활동명은 필수입니다.`,
    );
  }
  return addresses.map((a, i) => {
    if (!ethers.isAddress(a)) throw new Error(`ARTIST_ADDRESSES에 올바르지 않은 주소가 있습니다: ${a}`);
    const length = Buffer.byteLength(names[i], "utf8");
    if (length > MAX_ARTIST_NAME_BYTES) {
      throw new Error(`활동명은 ${MAX_ARTIST_NAME_BYTES}바이트 이하여야 합니다: ${names[i]} (${length}바이트)`);
    }
    return { address: ethers.getAddress(a), name: names[i] };
  });
}
