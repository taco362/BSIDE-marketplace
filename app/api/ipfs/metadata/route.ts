/**
 * 발행 메타데이터 업로드 (docs/architecture.md 6.3, proposal.md D12·D13)
 * JSON: address, issuedAt, signature, name, description, image(대표 이미지 CID)
 * 승인된 아티스트만 가능하다. { cid }를 돌려주며, 브라우저는 ipfs://<cid>로 mint를 호출한다.
 */
import { uploadJson } from "@/lib/ipfs/pinata";
import { readAuthFields, verifyUploadAuth } from "@/lib/upload/auth";
import { UploadError, toUploadErrorResponse } from "@/lib/upload/errors";
import { MAX_METADATA_REQUEST_BYTES, buildMetadataRecord } from "@/lib/upload/metadata";

export async function POST(request: Request) {
  try {
    const length = Number(request.headers.get("content-length"));
    if (Number.isFinite(length) && length > MAX_METADATA_REQUEST_BYTES) {
      throw new UploadError(413, "요청이 너무 큽니다.");
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      throw new UploadError(400, "JSON 형식으로 보내야 합니다.");
    }
    if (!body || typeof body !== "object") throw new UploadError(400, "JSON 형식으로 보내야 합니다.");

    // 메타데이터는 metadata 용도로만 받는다 (요청의 purpose 값은 쓰지 않음)
    const auth = readAuthFields((key) => (key === "purpose" ? "metadata" : body[key]));
    await verifyUploadAuth(auth);

    const record = buildMetadataRecord(body);
    const cid = await uploadJson(record, `metadata-${Date.now()}.json`);
    return Response.json({ cid });
  } catch (error) {
    return toUploadErrorResponse(error);
  }
}
