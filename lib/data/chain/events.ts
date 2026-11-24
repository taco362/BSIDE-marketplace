import "server-only";

/**
 * NFT별 거래 이력 (docs/architecture.md 6.1)
 * - readTokenEvents: 에스크로 이벤트 로그를 배포 블록부터 구간을 나누어 조회
 * - eventsFromListings: 로그 조회 실패 시 Listing에 저장된 시각으로 대체
 */
import { connection } from "next/server";
import { toBeHex, zeroPadValue, type Log } from "ethers";
import { DEPLOYMENT, getEscrowContract } from "@/lib/contracts";
import { CANCEL_REASONS, type Listing, type TradeEvent } from "@/lib/domain/types";
import { enumValue } from "./mappers";
import { getProvider } from "./provider";

/** eth_getLogs 한 번에 조회하는 블록 수. 무료 RPC의 범위 제한에 맞춰 조정한다 (Sepolia 배포 시 확인) */
const LOG_BLOCK_RANGE = 10_000;

/** tokenId가 두 번째 indexed 인자인 이벤트 */
const TOKEN_EVENTS = ["Listed", "Purchased", "Completed", "Cancelled", "Disputed"];

export async function readTokenEvents(tokenId: number, listingIds: number[]): Promise<TradeEvent[]> {
  if (listingIds.length === 0) return [];
  await connection();

  const provider = getProvider();
  const iface = getEscrowContract(provider).interface;
  const address = DEPLOYMENT.contracts.BSideEscrow.address;
  const topicOf = (name: string) => {
    const event = iface.getEvent(name);
    if (!event) throw new Error(`ABI에 ${name} 이벤트가 없습니다.`);
    return event.topicHash;
  };
  const toTopic = (id: number) => zeroPadValue(toBeHex(id), 32);

  const tokenEventFilter = [TOKEN_EVENTS.map(topicOf), null, toTopic(tokenId)];
  // DisputeResolved에는 tokenId가 없으므로 이 토큰의 거래 ID로 찾는다
  const resolvedFilter = [topicOf("DisputeResolved"), listingIds.map(toTopic)];

  const latest = await provider.getBlockNumber();
  const logs: Log[] = [];
  for (let from = DEPLOYMENT.contracts.BSideEscrow.deployBlock; from <= latest; from += LOG_BLOCK_RANGE) {
    const to = Math.min(from + LOG_BLOCK_RANGE - 1, latest);
    const [tokenLogs, resolvedLogs] = await Promise.all([
      provider.getLogs({ address, fromBlock: from, toBlock: to, topics: tokenEventFilter }),
      provider.getLogs({ address, fromBlock: from, toBlock: to, topics: resolvedFilter }),
    ]);
    logs.push(...tokenLogs, ...resolvedLogs);
  }
  logs.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);

  const blockNumbers = [...new Set(logs.map((log) => log.blockNumber))];
  const blocks = await Promise.all(blockNumbers.map((n) => provider.getBlock(n)));
  const timestamps = new Map(blockNumbers.map((n, i) => [n, blocks[i]?.timestamp ?? null]));

  const events: TradeEvent[] = [];
  for (const log of logs) {
    const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
    if (!parsed) continue;
    const a = parsed.args;
    const base = {
      listingId: Number(a.listingId),
      timestamp: timestamps.get(log.blockNumber) ?? null,
      txHash: log.transactionHash,
    };
    switch (parsed.name) {
      case "Listed":
        events.push({
          ...base,
          kind: "Listed",
          seller: a.seller,
          price: a.price,
          conditionCID: a.conditionCID,
          isPrimary: a.isPrimary,
        });
        break;
      case "Purchased":
        events.push({ ...base, kind: "Purchased", buyer: a.buyer });
        break;
      case "Disputed":
        events.push({ ...base, kind: "Disputed", buyer: a.buyer });
        break;
      case "DisputeResolved":
        events.push({ ...base, kind: "DisputeResolved", refundBuyer: a.refundBuyer });
        break;
      case "Completed":
        events.push({
          ...base,
          kind: "Completed",
          seller: a.seller,
          buyer: a.buyer,
          price: a.price,
          royalty: a.royalty,
          conditionCID: a.conditionCID,
        });
        break;
      case "Cancelled":
        events.push({ ...base, kind: "Cancelled", reason: enumValue(CANCEL_REASONS, a.reason, "CancelReason") });
        break;
    }
  }
  return events;
}

/**
 * 분쟁 제기 시각, 취소 사유, 로열티는 Listing에 저장되어 있지 않으므로 알 수 없음(null)으로 둔다.
 * 한 토큰은 동시에 하나의 거래에만 등록될 수 있으므로 거래 ID 순서가 곧 시간 순서다.
 */
export function eventsFromListings(listings: Listing[]): TradeEvent[] {
  const events: TradeEvent[] = [];
  for (const l of listings) {
    const listingId = l.listingId;
    events.push({
      kind: "Listed",
      listingId,
      timestamp: l.listedAt,
      txHash: null,
      seller: l.seller,
      price: l.price,
      conditionCID: l.conditionCID,
      isPrimary: l.isPrimary,
    });
    if (l.buyer && l.lockedAt !== null) {
      events.push({ kind: "Purchased", listingId, timestamp: l.lockedAt, txHash: null, buyer: l.buyer });
    }
    if (l.status === "DISPUTED" && l.buyer) {
      events.push({ kind: "Disputed", listingId, timestamp: null, txHash: null, buyer: l.buyer });
    }
    if (l.status === "COMPLETED" && l.buyer) {
      events.push({
        kind: "Completed",
        listingId,
        timestamp: l.closedAt,
        txHash: null,
        seller: l.seller,
        buyer: l.buyer,
        price: l.price,
        royalty: null,
        conditionCID: l.conditionCID,
      });
    }
    if (l.status === "CANCELLED") {
      events.push({ kind: "Cancelled", listingId, timestamp: l.closedAt, txHash: null, reason: null });
    }
  }
  return events;
}
