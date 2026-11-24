/**
 * 스크립트 입력(환경 변수) 읽기와 형식 확인
 * 형식만 미리 확인해 명확한 안내를 준다. 최종 검증은 항상 컨트랙트가 한다.
 */
import { parseEther } from "ethers";

/** BSideNFT.Policy enum 값 */
export const POLICIES = { PriceCap: 0, Royalty: 1, Free: 2 } as const;
export type PolicyName = keyof typeof POLICIES;

export function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function requireEnv(name: string): string {
  const value = readEnv(name);
  if (!value) throw new Error(`환경 변수 ${name}가 필요합니다.`);
  return value;
}

export interface MintArgs {
  metadataUri: string;
  initialPrice: bigint;
  policyName: PolicyName;
  policyBps: number;
}

/**
 * 발행 인자: METADATA_URI(필수), INITIAL_PRICE_ETH, POLICY, POLICY_BPS
 * defaults가 없으면 모두 필수다 (mint.ts). 로컬 테스트 데이터(seed.ts)는 기본값을 쓴다.
 */
export function readMintArgs(defaults?: { initialPriceEth: string; policy: PolicyName; policyBps: string }): MintArgs {
  const metadataUri = requireEnv("METADATA_URI");
  if (!metadataUri.startsWith("ipfs://") || metadataUri.length <= "ipfs://".length) {
    throw new Error(`METADATA_URI는 ipfs://<CID> 형식이어야 합니다: ${metadataUri}`);
  }

  const priceEth = readEnv("INITIAL_PRICE_ETH") ?? defaults?.initialPriceEth;
  if (!priceEth) throw new Error("환경 변수 INITIAL_PRICE_ETH가 필요합니다.");

  const policyName = (readEnv("POLICY") ?? defaults?.policy) as PolicyName | undefined;
  if (!policyName) throw new Error("환경 변수 POLICY가 필요합니다.");
  if (!(policyName in POLICIES)) throw new Error(`POLICY는 PriceCap, Royalty, Free 중 하나여야 합니다: ${policyName}`);

  const bpsRaw = readEnv("POLICY_BPS") ?? (readEnv("POLICY") ? undefined : defaults?.policyBps) ?? "0";
  if (!/^[0-9]+$/.test(bpsRaw)) throw new Error(`POLICY_BPS는 0 이상의 정수여야 합니다: ${bpsRaw}`);

  return { metadataUri, initialPrice: parseEther(priceEth), policyName, policyBps: Number(bpsRaw) };
}
