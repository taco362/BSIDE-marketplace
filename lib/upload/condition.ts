import "server-only";

/**
 * 상품 상태 기록 JSON 작성 (docs/architecture.md 6.3, proposal.md D11·D12)
 * 판매자가 보낸 값은 상태 정보(sealed·condition·defects)와 사진 CID 목록뿐이다.
 * tokenId·seller·createdAt은 서명 확인을 통과한 값과 서버 시각으로 서버가 채운다.
 */
import {
  NO_DEFECTS,
  checkConditionInput,
  checkImageCount,
  isCid,
  type ConditionRecord,
} from "@/lib/domain/upload";
import type { UploadAuth } from "./auth";
import { UploadError } from "./errors";

/** JSON 요청 본문 최대 크기 (텍스트 2개 + CID 5개 + 서명) */
export const MAX_CONDITION_REQUEST_BYTES = 16 * 1024;

export function buildConditionRecord(body: Record<string, unknown>, auth: UploadAuth): ConditionRecord {
  const { sealed, condition, defects, images } = body;
  if (typeof sealed !== "boolean") throw new UploadError(400, "개봉 여부를 선택하세요.");
  if (typeof condition !== "string") throw new UploadError(400, "사용 상태를 입력하세요.");
  if (defects !== undefined && typeof defects !== "string") throw new UploadError(400, "하자 정보 형식이 올바르지 않습니다.");

  const input = { sealed, condition: condition.trim(), defects: (defects ?? "").trim() };
  const inputError = checkConditionInput(input);
  if (inputError) throw new UploadError(400, inputError);

  if (!Array.isArray(images)) throw new UploadError(400, "사진 목록이 없습니다.");
  const countError = checkImageCount(images.length);
  if (countError) throw new UploadError(400, countError);
  if (!images.every(isCid)) throw new UploadError(400, "사진 CID 형식이 올바르지 않습니다.");
  if (new Set(images).size !== images.length) throw new UploadError(400, "같은 사진이 중복되어 있습니다.");

  return {
    tokenId: auth.tokenId as number,
    seller: auth.address,
    sealed: input.sealed,
    condition: input.condition,
    defects: input.defects || NO_DEFECTS,
    images,
    createdAt: new Date().toISOString(),
  };
}
