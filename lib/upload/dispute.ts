import "server-only";

/**
 * 분쟁 사유 기록 JSON 작성 (proposal.md D15, docs/architecture.md 6.8)
 * 구매자가 보낸 값은 사유·설명·사진 CID 목록뿐이다. listingId·tokenId·buyer·createdAt은
 * 서명 확인을 통과한 거래 정보와 서버 시각으로 서버가 채운다.
 */
import {
  checkDisputeImageCount,
  checkDisputeInput,
  isDisputeReason,
  type DisputeRecord,
} from "@/lib/domain/dispute";
import type { ListingWithToken } from "@/lib/domain/types";
import { isCid } from "@/lib/domain/upload";
import { UploadError } from "./errors";

/** JSON 요청 본문 최대 크기 (설명 500자 + CID 3개 + 서명) */
export const MAX_DISPUTE_REQUEST_BYTES = 16 * 1024;

export function buildDisputeRecord(body: Record<string, unknown>, { listing }: ListingWithToken): DisputeRecord {
  const { reason, description, images } = body;
  if (!isDisputeReason(reason)) throw new UploadError(400, "분쟁 사유를 선택하세요.");
  if (description !== undefined && typeof description !== "string") {
    throw new UploadError(400, "설명 형식이 올바르지 않습니다.");
  }
  const input = { reason, description: (description ?? "").trim() };
  const inputError = checkDisputeInput(input);
  if (inputError) throw new UploadError(400, inputError);

  if (!Array.isArray(images)) throw new UploadError(400, "사진 목록이 없습니다.");
  const countError = checkDisputeImageCount(images.length);
  if (countError) throw new UploadError(400, countError);
  if (!images.every(isCid)) throw new UploadError(400, "사진 CID 형식이 올바르지 않습니다.");
  if (new Set(images).size !== images.length) throw new UploadError(400, "같은 사진이 중복되어 있습니다.");

  return {
    type: "dispute",
    listingId: listing.listingId,
    tokenId: listing.tokenId,
    buyer: listing.buyer as string,
    reason: input.reason,
    description: input.description,
    images,
    createdAt: new Date().toISOString(),
  };
}
