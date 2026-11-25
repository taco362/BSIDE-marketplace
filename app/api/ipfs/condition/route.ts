/**
 * 상품 상태 기록 업로드 (docs/architecture.md 6.3, proposal.md D11·D12)
 * JSON: tokenId, address, issuedAt, signature + (재판매만) sealed, condition, defects, images(사진 CID 1~5개)
 * 서버가 tokenId·seller·createdAt을 채운 상태 기록 JSON을 올리고 { cid }를 돌려준다. 이 CID로 list를 호출한다.
 * 최초 판매(D1·D9)면 상태 입력을 쓰지 않고 대표 이미지로 "아티스트 최초 판매" 기록을 작성한다 (D11).
 */
import { uploadJson } from "@/lib/ipfs/pinata";
import { readAuthFields, verifyUploadAuth } from "@/lib/upload/auth";
import { MAX_CONDITION_REQUEST_BYTES, buildConditionRecord } from "@/lib/upload/condition";
import { UploadError, toUploadErrorResponse } from "@/lib/upload/errors";

export async function POST(request: Request) {
  try {
    const length = Number(request.headers.get("content-length"));
    if (Number.isFinite(length) && length > MAX_CONDITION_REQUEST_BYTES) {
      throw new UploadError(413, "요청이 너무 큽니다.");
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      throw new UploadError(400, "JSON 형식으로 보내야 합니다.");
    }
    if (!body || typeof body !== "object") throw new UploadError(400, "JSON 형식으로 보내야 합니다.");

    // 상태 기록은 condition 용도로만 받는다 (요청의 purpose 값은 쓰지 않음)
    const auth = readAuthFields((key) => (key === "purpose" ? "condition" : body[key]));
    const token = await verifyUploadAuth(auth);
    if (!token) throw new UploadError(500, "NFT 정보를 확인하지 못했습니다.");

    // 최초 판매면 입력값을 쓰지 않고 서버가 기록을 작성한다 (D11)
    const record = await buildConditionRecord(body, auth, token);
    const cid = await uploadJson(record, `condition-token${record.tokenId}-${Date.now()}.json`);
    return Response.json({ cid });
  } catch (error) {
    return toUploadErrorResponse(error);
  }
}
