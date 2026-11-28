/**
 * 트랜잭션 오류 테스트용 로컬 Hardhat 노드와 컨트랙트 배포 (docs/architecture.md 9장)
 * - 포트 8546에 노드를 따로 띄운다 (개발용 8545 노드와 겹치지 않게). 테스트가 끝나면 종료한다.
 * - 컨트랙트는 contracts/artifacts의 바이트코드로 배포한다. 먼저 `cd contracts; npm run compile`이 필요하다.
 * - lib/contracts/deployment.json(Sepolia 주소)은 건드리지 않는다. 앱과 같은 ABI(lib/contracts/abi)로 호출한다.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Contract, ContractFactory, JsonRpcProvider, type JsonRpcSigner } from "ethers";
import escrowAbi from "@/lib/contracts/abi/BSideEscrow.json";
import nftAbi from "@/lib/contracts/abi/BSideNFT.json";

export const PORT = 8546;
export const CONFIRM_PERIOD = 300;
const ROOT = path.resolve(__dirname, "../..");
const CONTRACTS_DIR = path.join(ROOT, "contracts");

function artifact(name: "BSideNFT" | "BSideEscrow"): { bytecode: string } {
  const file = path.join(CONTRACTS_DIR, "artifacts", "contracts", `${name}.sol`, `${name}.json`);
  if (!existsSync(file)) throw new Error(`${file}이 없습니다. 먼저 "cd contracts; npm run compile"을 실행하세요.`);
  return JSON.parse(readFileSync(file, "utf8")) as { bytecode: string };
}

export interface LocalChain {
  provider: JsonRpcProvider;
  /** #0 관리자, #1 아티스트, #2 구매자, #3 다른 사용자 */
  admin: JsonRpcSigner;
  artist: JsonRpcSigner;
  buyer: JsonRpcSigner;
  other: JsonRpcSigner;
  nft: Contract;
  escrow: Contract;
  stop: () => Promise<void>;
}

async function waitForRpc(provider: JsonRpcProvider, node: ChildProcess, timeoutMs = 60_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (node.exitCode !== null) throw new Error(`Hardhat 노드가 종료되었습니다 (코드 ${node.exitCode}).`);
    try {
      await provider.getBlockNumber();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`Hardhat 노드가 ${timeoutMs / 1000}초 안에 응답하지 않았습니다 (포트 ${PORT}).`);
}

function killTree(node: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (node.exitCode !== null || !node.pid) return resolve();
    node.once("exit", () => resolve());
    // shell로 띄운 npx의 자식 프로세스(노드)까지 종료한다
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(node.pid), "/T", "/F"]);
    else node.kill("SIGTERM");
  });
}

export async function startLocalChain(): Promise<LocalChain> {
  const nftArtifact = artifact("BSideNFT");
  const escrowArtifact = artifact("BSideEscrow");

  const node = spawn("npx", ["hardhat", "node", "--port", String(PORT)], {
    cwd: CONTRACTS_DIR,
    shell: true,
    stdio: "ignore",
  });
  const provider = new JsonRpcProvider(`http://127.0.0.1:${PORT}`, undefined, {
    staticNetwork: true,
    polling: true,
    // ethers는 같은 요청 결과를 250ms 동안 재사용한다. 실패한 호출을 상태를 바꾼 뒤 똑같이 다시 보내므로 끈다
    cacheTimeout: -1,
  });
  try {
    await waitForRpc(provider, node);
    const [admin, artist, buyer, other] = await Promise.all([0, 1, 2, 3].map((i) => provider.getSigner(i)));

    const nftDeployed = await new ContractFactory(nftAbi, nftArtifact.bytecode, admin).deploy(admin.address);
    await nftDeployed.waitForDeployment();
    const nftAddress = await nftDeployed.getAddress();
    const escrowDeployed = await new ContractFactory(escrowAbi, escrowArtifact.bytecode, admin).deploy(
      admin.address,
      nftAddress,
      CONFIRM_PERIOD,
    );
    await escrowDeployed.waitForDeployment();
    const escrowAddress = await escrowDeployed.getAddress();

    const nft = new Contract(nftAddress, nftAbi, admin);
    const escrow = new Contract(escrowAddress, escrowAbi, admin);
    await (await nft.getFunction("setEscrow")(escrowAddress)).wait();
    await (await nft.getFunction("registerArtist")(artist.address, "테스트 아티스트")).wait();

    return {
      provider,
      admin,
      artist,
      buyer,
      other,
      nft,
      escrow,
      stop: async () => {
        provider.destroy();
        await killTree(node);
      },
    };
  } catch (error) {
    provider.destroy();
    await killTree(node);
    throw error;
  }
}

/** 블록 시각을 앞으로 옮긴다 (수령 승인 기한 경과) */
export async function increaseTime(provider: JsonRpcProvider, seconds: number): Promise<void> {
  await provider.send("evm_increaseTime", [seconds]);
  await provider.send("evm_mine", []);
}
