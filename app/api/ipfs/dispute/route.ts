/**
 * 분쟁 사유 기록 업로드 (proposal.md D15, docs/architecture.md 6.8)
 * JSON: listingId, address, issuedAt, signature, reason, description, images(사진 CID 0~3개)
 * 거래의 구매자만(LOCKED, 수령 승인 기한 전) 가능하다. 서버가 기록을 작성하고 거래 꼬리표를 붙여 올린 뒤 { cid }를 돌려준다.
 * 브라우저는 이어서 openDispute를 호출한다. 컨트랙트에는 CID를 넘기지 않는다.
 */
import { DEPLOYMENT } from "@/lib/contracts";
import { DISPUTE_TAG_KEY, disputeTagValue } from "@/lib/domain/dispute";
import { uploadJson } from "@/lib/ipfs/pinata";
import { readAuthFields, verifyDisputeAuth } from "@/lib/upload/auth";
import { MAX_DISPUTE_REQUEST_BYTES, buildDisputeRecord } from "@/lib/upload/dispute";
import { UploadError, toUploadErrorResponse } from "@/lib/upload/errors";

export async function POST(request: Request) {
  try {
    const length = Number(request.headers.get("content-length"));
    if (Number.isFinite(length) && length > MAX_DISPUTE_REQUEST_BYTES) {
      throw new UploadError(413, "요청이 너무 큽니다.");
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      throw new UploadError(400, "JSON 형식으로 보내야 합니다.");
    }
    if (!body || typeof body !== "object") throw new UploadError(400, "JSON 형식으로 보내야 합니다.");

    // 분쟁 사유는 dispute 용도로만 받는다 (요청의 purpose 값은 쓰지 않음)
    const auth = readAuthFields((key) => (key === "purpose" ? "dispute" : body[key]));
    const item = await verifyDisputeAuth(auth);

    const record = buildDisputeRecord(body, item);
    const cid = await uploadJson(record, `dispute-listing${record.listingId}-${Date.now()}.json`, {
      [DISPUTE_TAG_KEY]: disputeTagValue(DEPLOYMENT.chainId, DEPLOYMENT.contracts.BSideEscrow.address, record.listingId),
    });
    return Response.json({ cid });
  } catch (error) {
    return toUploadErrorResponse(error);
  }
}
