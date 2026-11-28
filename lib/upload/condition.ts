import "server-only";

/**
 * 상품 상태 기록 JSON 작성 (docs/architecture.md 6.3, proposal.md D11·D12)
 * - 재판매: 판매자가 보낸 값은 상태 정보(sealed·condition·defects)와 사진 CID 목록뿐이다.
 * - 최초 판매: 판매자 입력을 쓰지 않고, NFT 메타데이터의 대표 이미지로 서버가 기록을 작성한다.
 * 어느 쪽인지는 요청 값이 아니라 체인의 NFT 정보로 정한다 (BSideEscrow.list의 isPrimary 판정과 같음).
 * tokenId·seller·createdAt은 서명 확인을 통과한 값과 서버 시각으로 서버가 채운다.
 */
import { cidFromIpfsUri } from "@/lib/domain/conditionRecord";
import { isPrimarySale } from "@/lib/domain/policy";
import type { Token } from "@/lib/domain/types";
import {
  NO_DEFECTS,
  PRIMARY_CONDITION_TEXT,
  checkConditionInput,
  checkImageCount,
  isCid,
  type ConditionRecord,
  type PrimaryConditionRecord,
  type ResaleConditionRecord,
} from "@/lib/domain/upload";
import { GatewayError, fetchIpfsJson } from "@/lib/ipfs/gateway";
import type { UploadAuth } from "./auth";
import { UploadError } from "./errors";

/** JSON 요청 본문 최대 크기 (텍스트 2개 + CID 5개 + 서명) */
export const MAX_CONDITION_REQUEST_BYTES = 16 * 1024;

export async function buildConditionRecord(
  body: Record<string, unknown>,
  auth: UploadAuth,
  token: Token,
): Promise<ConditionRecord> {
  return isPrimarySale(token, auth.address) ? buildPrimaryRecord(auth, token) : buildResaleRecord(body, auth);
}

function buildResaleRecord(body: Record<string, unknown>, auth: UploadAuth): ResaleConditionRecord {
  const { sealed, condition, defects, images, aiAssisted } = body;
  if (typeof sealed !== "boolean") throw new UploadError(400, "개봉 여부를 선택하세요.");
  if (aiAssisted !== undefined && typeof aiAssisted !== "boolean") {
    throw new UploadError(400, "AI 초안 활용 표시 형식이 올바르지 않습니다.");
  }
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
    type: "resale",
    tokenId: auth.tokenId as number,
    seller: auth.address,
    sealed: input.sealed,
    condition: input.condition,
    defects: input.defects || NO_DEFECTS,
    images,
    createdAt: new Date().toISOString(),
    // 판매자 자기 신고 (D14). false·없음이면 필드를 넣지 않아 기존 기록과 같은 형식이 된다
    ...(aiAssisted === true ? { aiAssisted: true as const } : {}),
  };
}

async function buildPrimaryRecord(auth: UploadAuth, token: Token): Promise<PrimaryConditionRecord> {
  return {
    type: "primary",
    tokenId: auth.tokenId as number,
    seller: auth.address,
    condition: PRIMARY_CONDITION_TEXT,
    metadata: token.tokenURI,
    images: await representativeImages(token.tokenURI),
    createdAt: new Date().toISOString(),
  };
}

/**
 * 메타데이터의 image가 "ipfs://<CID>"이면 [CID], 아니면 빈 배열.
 * tokenURI가 "ipfs://<CID>"가 아니거나(http 주소 등) 메타데이터 형식이 맞지 않아도 빈 배열 (서버는 CID만 요청한다).
 */
async function representativeImages(tokenURI: string): Promise<string[]> {
  const metadataCid = cidFromIpfsUri(tokenURI);
  if (!metadataCid) return [];
  let metadata: unknown;
  try {
    metadata = await fetchIpfsJson(metadataCid);
  } catch (error) {
    if (!(error instanceof GatewayError)) throw error;
    if (error.kind === "format") return [];
    throw new UploadError(502, `NFT 메타데이터를 읽지 못해 상태 기록을 만들지 못했습니다. 잠시 후 다시 시도하세요. (${error.message})`);
  }
  const image = (metadata as { image?: unknown } | null)?.image;
  const imageCid = typeof image === "string" ? cidFromIpfsUri(image) : null;
  return imageCid ? [imageCid] : [];
}
