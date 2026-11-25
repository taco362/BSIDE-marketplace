import "server-only";

/**
 * 업로드 확인: 서명·유효 시간·권한 (docs/architecture.md 6.3, proposal.md D12)
 * 1. 요청 값으로 서명 문장을 다시 만들어 서명자를 복원하고 address와 비교한다.
 * 2. 서명 시각이 유효 시간 안인지 확인한다.
 * 3. 체인에서 권한을 확인한다: condition → NFT 현재 소유자, metadata → 승인된 아티스트.
 */
import { verifyMessage } from "ethers";
import { DEPLOYMENT } from "@/lib/contracts";
import { getMarketReader } from "@/lib/data";
import { accountOf } from "@/lib/domain/account";
import { isSameAddress } from "@/lib/domain/format";
import type { Token } from "@/lib/domain/types";
import {
  UPLOAD_AUTH_MAX_AGE_SECONDS,
  UPLOAD_AUTH_MAX_SKEW_SECONDS,
  UPLOAD_PURPOSES,
  buildUploadMessage,
  type UploadAuthFields,
} from "@/lib/domain/upload";
import { UploadError } from "./errors";

export interface UploadAuth extends UploadAuthFields {
  signature: string;
}

/** 요청 본문(FormData 또는 JSON)에서 서명 관련 값을 읽고 형식을 확인한다 */
export function readAuthFields(get: (key: string) => unknown): UploadAuth {
  const purpose = get("purpose");
  const address = get("address");
  const issuedAt = Number(get("issuedAt"));
  const signature = get("signature");
  const rawTokenId = get("tokenId");

  if (typeof purpose !== "string" || !(UPLOAD_PURPOSES as readonly string[]).includes(purpose)) {
    throw new UploadError(400, "업로드 용도가 올바르지 않습니다.");
  }
  if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new UploadError(400, "지갑 주소 형식이 올바르지 않습니다.");
  }
  if (!Number.isSafeInteger(issuedAt) || issuedAt <= 0) {
    throw new UploadError(400, "서명 시각이 올바르지 않습니다.");
  }
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(signature)) {
    throw new UploadError(401, "업로드 확인 서명이 없습니다.");
  }
  let tokenId: number | null = null;
  if (purpose === "condition") {
    tokenId = Number(rawTokenId);
    if (!Number.isSafeInteger(tokenId) || tokenId <= 0) throw new UploadError(400, "NFT 번호가 올바르지 않습니다.");
  }
  return {
    purpose: purpose as UploadAuth["purpose"],
    tokenId,
    address,
    chainId: DEPLOYMENT.chainId,
    issuedAt,
    signature,
  };
}

function verifySignature(auth: UploadAuth): void {
  let signer: string;
  try {
    signer = verifyMessage(buildUploadMessage(auth), auth.signature);
  } catch {
    throw new UploadError(401, "업로드 확인 서명을 해석할 수 없습니다. 다시 서명하세요.");
  }
  if (!isSameAddress(signer, auth.address)) {
    throw new UploadError(401, "업로드 확인 서명이 지갑 주소와 일치하지 않습니다. 다시 서명하세요.");
  }
}

function verifyFreshness(issuedAt: number, nowSeconds: number): void {
  if (issuedAt > nowSeconds + UPLOAD_AUTH_MAX_SKEW_SECONDS) {
    throw new UploadError(401, "서명 시각이 올바르지 않습니다. 컴퓨터 시계를 확인하고 다시 서명하세요.");
  }
  if (nowSeconds - issuedAt > UPLOAD_AUTH_MAX_AGE_SECONDS) {
    throw new UploadError(401, `업로드 확인 서명이 만료되었습니다 (유효 ${UPLOAD_AUTH_MAX_AGE_SECONDS / 60}분). 다시 서명하세요.`);
  }
}

/** condition 용도면 확인에 쓴 NFT 정보를, metadata 용도면 null을 돌려준다 */
async function verifyPermission(auth: UploadAuth): Promise<Token | null> {
  const reader = getMarketReader();
  try {
    if (auth.purpose === "condition") {
      const token = await reader.getToken(auth.tokenId as number);
      if (!token) throw new UploadError(400, `NFT #${auth.tokenId}이(가) 없습니다.`);
      if (token.inEscrow) throw new UploadError(403, "이미 판매 등록되어 에스크로에 보관 중인 NFT입니다.");
      if (!isSameAddress(token.owner, auth.address)) {
        throw new UploadError(403, "NFT 소유자만 상품 상태 기록을 올릴 수 있습니다.");
      }
      return token;
    }
    const accounts = await reader.getAccounts([auth.address]);
    if (!accountOf(accounts, auth.address).verifiedArtist) {
      throw new UploadError(403, "승인된 아티스트만 발행 메타데이터를 올릴 수 있습니다.");
    }
    return null;
  } catch (error) {
    if (error instanceof UploadError) throw error;
    console.error("[upload] 권한 확인 중 블록체인 조회 실패", error);
    throw new UploadError(502, "블록체인 조회에 실패해 권한을 확인하지 못했습니다. 잠시 후 다시 시도하세요.");
  }
}

/**
 * 서명 → 유효 시간 → 권한 순서로 확인한다. 통과하지 못하면 UploadError.
 * condition 용도면 권한 확인에 쓴 NFT 정보를 돌려준다 (최초 판매 판단에 사용).
 */
export async function verifyUploadAuth(
  auth: UploadAuth,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<Token | null> {
  verifySignature(auth);
  verifyFreshness(auth.issuedAt, nowSeconds);
  return verifyPermission(auth);
}
