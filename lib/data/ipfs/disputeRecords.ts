import "server-only";

/**
 * 분쟁 사유 기록 조회 (proposal.md D15, docs/architecture.md 6.8)
 * Pinata 꼬리표로 거래의 기록 CID를 찾고(최근 순), 게이트웨이에서 읽어 이 거래·구매자의 기록인지 확인한다.
 * 같은 거래에 기록이 여러 개면(서명 후 분쟁 제기 거부·재시도) 가장 최근의 유효한 기록을 쓴다.
 * 오류를 던지지 않고 결과 종류로 돌려준다. 페이지는 기다리지 않고 Promise를 넘긴다.
 */
import { cache } from "react";
import { DEPLOYMENT } from "@/lib/contracts";
import { DISPUTE_TAG_KEY, disputeTagValue, parseDisputeRecord, type DisputeRecordResult } from "@/lib/domain/dispute";
import type { Listing } from "@/lib/domain/types";
import { GatewayError, fetchIpfsJson } from "@/lib/ipfs/gateway";
import { PinataError, findFilesByKeyvalues } from "@/lib/ipfs/pinata";

/** 한 거래에서 확인할 최대 기록 수 */
const MAX_CANDIDATES = 5;

/** 같은 요청 안에서 같은 거래는 한 번만 찾는다 (React.cache는 인자를 값으로 비교하므로 원시값만 받는다) */
const findDisputeRecord = cache(
  async (listingId: number, tokenId: number, buyer: string | null): Promise<DisputeRecordResult> => {
    const listing = { listingId, tokenId, buyer };
    let cids: string[];
    try {
      cids = await findFilesByKeyvalues(
        {
          [DISPUTE_TAG_KEY]: disputeTagValue(DEPLOYMENT.chainId, DEPLOYMENT.contracts.BSideEscrow.address, listing.listingId),
        },
        MAX_CANDIDATES,
      );
    } catch (error) {
      if (!(error instanceof PinataError)) console.error("[disputeRecords] 예상하지 못한 오류", error);
      return { status: "unavailable" };
    }

    let failed = false;
    for (const cid of cids) {
      try {
        const record = parseDisputeRecord(await fetchIpfsJson(cid), listing);
        if (record) return { status: "ok", record, cid };
      } catch (error) {
        if (!(error instanceof GatewayError)) console.error("[disputeRecords] 예상하지 못한 오류", cid, error);
        if (!(error instanceof GatewayError && error.kind === "format")) failed = true;
      }
    }
    return failed ? { status: "unavailable" } : { status: "none" };
  },
);

export function getDisputeRecord(listing: Pick<Listing, "listingId" | "tokenId" | "buyer">): Promise<DisputeRecordResult> {
  return findDisputeRecord(listing.listingId, listing.tokenId, listing.buyer);
}
