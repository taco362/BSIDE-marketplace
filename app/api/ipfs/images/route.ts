/**
 * 사진 1장 업로드 (docs/architecture.md 6.3, proposal.md D11·D12)
 * multipart: file, purpose(condition|metadata|dispute), tokenId(condition일 때), listingId(dispute일 때), address, issuedAt, signature
 * 응답: 200 { cid } / 오류 { error } + 상태 코드
 */
import { IMAGE_EXTENSIONS } from "@/lib/domain/upload";
import { uploadFile } from "@/lib/ipfs/pinata";
import { readAuthFields, verifyUploadAuth } from "@/lib/upload/auth";
import { UploadError, toUploadErrorResponse } from "@/lib/upload/errors";
import { checkRequestSize, readImage } from "@/lib/upload/image";

export async function POST(request: Request) {
  try {
    checkRequestSize(request.headers.get("content-length"));

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new UploadError(400, "multipart/form-data 형식으로 보내야 합니다.");
    }

    // 업로드 전에 서명·유효 시간·권한부터 확인한다
    const auth = readAuthFields((key) => form.get(key));
    await verifyUploadAuth(auth);

    const file = form.get("file");
    if (!(file instanceof File)) throw new UploadError(400, "사진 파일(file)이 없습니다.");
    const { bytes, type } = await readImage(file);

    // 사용자 파일 이름 대신 서버가 정한 이름을 쓴다 (원본 파일 이름의 개인정보 노출 방지)
    const subject =
      auth.tokenId !== null ? `-token${auth.tokenId}` : auth.listingId !== null ? `-listing${auth.listingId}` : "";
    const name = `${auth.purpose}${subject}-${Date.now()}.${IMAGE_EXTENSIONS[type]}`;
    const cid = await uploadFile(bytes, name, type);

    return Response.json({ cid });
  } catch (error) {
    return toUploadErrorResponse(error);
  }
}
