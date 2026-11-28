/**
 * AI 상태 기록 초안 (docs/architecture.md 6.7 A2, proposal.md D14)
 * multipart: files(사진 1~5장), tokenId, address, issuedAt, signature (업로드 확인 서명, 용도 condition)
 * 응답: 200 { draft: { sealed, condition, defects } } / 오류 { error } + 상태 코드
 * 사진은 IPFS에 올리지 않고 AI에만 보낸다. 초안은 판매자가 확인·수정한 뒤 기존 상태 기록 업로드로 등록한다.
 */
import { draftCondition } from "@/lib/ai/conditionDraft";
import { toAiErrorResponse } from "@/lib/ai/errors";
import { MAX_AI_DRAFT_REQUEST_BYTES } from "@/lib/domain/ai";
import { isPrimarySale } from "@/lib/domain/policy";
import { checkImageCount } from "@/lib/domain/upload";
import { readAuthFields, verifyUploadAuth } from "@/lib/upload/auth";
import { UploadError } from "@/lib/upload/errors";
import { readImage } from "@/lib/upload/image";

export async function POST(request: Request) {
  try {
    const length = Number(request.headers.get("content-length"));
    if (Number.isFinite(length) && length > MAX_AI_DRAFT_REQUEST_BYTES) {
      throw new UploadError(413, "요청이 너무 큽니다. 사진 수를 줄여 다시 시도하세요.");
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new UploadError(400, "multipart/form-data 형식으로 보내야 합니다.");
    }

    // AI 호출 전에 서명·유효 시간·권한(NFT 현재 소유자)부터 확인한다. 용도는 항상 condition
    const auth = readAuthFields((key) => (key === "purpose" ? "condition" : form.get(key)));
    const token = await verifyUploadAuth(auth);
    if (!token) throw new UploadError(500, "NFT 정보를 확인하지 못했습니다.");
    if (isPrimarySale(token, auth.address)) {
      throw new UploadError(400, "최초 판매는 상태를 입력하지 않으므로 AI 초안이 필요 없습니다.");
    }

    const files = form.getAll("files");
    const countError = checkImageCount(files.length);
    if (countError) throw new UploadError(400, countError);
    if (!files.every((f): f is File => f instanceof File)) throw new UploadError(400, "사진 파일 형식이 올바르지 않습니다.");
    const images = await Promise.all(files.map(readImage));

    const draft = await draftCondition(images);
    return Response.json({ draft });
  } catch (error) {
    return toAiErrorResponse(error);
  }
}
