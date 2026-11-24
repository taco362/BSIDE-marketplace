/**
 * lib/contracts/deployment.json 읽기 (deploy.ts가 생성)
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEPLOYMENT_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../lib/contracts/deployment.json",
);

export interface Deployment {
  network: string;
  chainId: number;
  confirmPeriod: number;
  contracts: {
    BSideNFT: { address: string; deployBlock: number };
    BSideEscrow: { address: string; deployBlock: number };
  };
}

/** 배포 정보를 읽고, 현재 연결된 네트워크용인지 확인한다. */
export async function readDeployment(chainId: number, networkName: string): Promise<Deployment> {
  const deployment = JSON.parse(await readFile(DEPLOYMENT_FILE, "utf8")) as Deployment;
  if (deployment.chainId !== chainId) {
    throw new Error(
      `deployment.json은 chainId ${deployment.chainId}용입니다. 현재 네트워크 ${networkName}(chainId ${chainId})에 먼저 배포하세요.`,
    );
  }
  return deployment;
}
