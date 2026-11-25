import "server-only";

/**
 * 이벤트 로그 구간 조회 (docs/architecture.md 6.1)
 * 무료 RPC의 eth_getLogs 범위 제한에 맞춰 배포 블록부터 LOG_BLOCK_RANGE씩 나누어 조회한다.
 */
import type { Log, TopicFilter } from "ethers";
import { getProvider } from "./provider";

/** eth_getLogs 한 번에 조회하는 블록 수. 무료 RPC의 범위 제한에 맞춰 조정한다 (Sepolia 배포 시 확인) */
const LOG_BLOCK_RANGE = 10_000;

/** 여러 필터를 같은 구간으로 나누어 조회하고 블록·로그 순서로 정렬해 합친다. */
export async function getLogsInRanges(address: string, fromBlock: number, filters: TopicFilter[]): Promise<Log[]> {
  const provider = getProvider();
  const latest = await provider.getBlockNumber();
  const logs: Log[] = [];
  for (let from = fromBlock; from <= latest; from += LOG_BLOCK_RANGE) {
    const to = Math.min(from + LOG_BLOCK_RANGE - 1, latest);
    const results = await Promise.all(
      filters.map((topics) => provider.getLogs({ address, fromBlock: from, toBlock: to, topics })),
    );
    logs.push(...results.flat());
  }
  return logs.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);
}
