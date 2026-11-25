import "server-only";

/**
 * 발행 메타데이터 JSON 작성 (docs/architecture.md 6.3, proposal.md D13)
 * 형식: { name, description, image: "ipfs://<대표 이미지 CID>" } — Phase 1에서 수동으로 올리던 메타데이터와 같다.
 */
import { checkMetadataInput, isCid, type MetadataRecord } from "@/lib/domain/upload";
import { UploadError } from "./errors";

/** JSON 요청 본문 최대 크기 (이름·설명 + CID 1개 + 서명) */
export const MAX_METADATA_REQUEST_BYTES = 16 * 1024;

export function buildMetadataRecord(body: Record<string, unknown>): MetadataRecord {
  const { name, description, image } = body;
  if (typeof name !== "string") throw new UploadError(400, "굿즈 이름을 입력하세요.");
  if (typeof description !== "string") throw new UploadError(400, "설명을 입력하세요.");

  const input = { name: name.trim(), description: description.trim() };
  const inputError = checkMetadataInput(input);
  if (inputError) throw new UploadError(400, inputError);
  if (!isCid(image)) throw new UploadError(400, "대표 이미지를 올리세요.");

  return { ...input, image: `ipfs://${image}` };
}
