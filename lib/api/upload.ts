/**
 * 업로드 API 호출 (클라이언트 전용, docs/architecture.md 6.3)
 * - signUploadAuth: 업로드 확인 문장에 MetaMask로 서명 (가스비 없음, personal_sign)
 * - uploadImage: 사진 1장 → POST /api/ipfs/images → 사진 CID
 * - uploadCondition: 상태 정보 + 사진 CID → POST /api/ipfs/condition → 상태 기록 CID
 * - uploadPrimaryCondition: 최초 판매는 입력 없이 같은 API → 서버가 작성한 상태 기록 CID
 * - uploadMetadata: 이름·설명 + 대표 이미지 CID → POST /api/ipfs/metadata → 메타데이터 CID
 * Pinata 키는 서버에만 있다. 브라우저는 우리 서버 API만 호출한다.
 */
import type { Signer } from "ethers";
import { DEPLOYMENT } from "@/lib/contracts";
import { UserFacingError } from "@/lib/domain/errors";
import {
  buildUploadMessage,
  type ConditionInput,
  type MetadataInput,
  type UploadPurpose,
} from "@/lib/domain/upload";

export class UploadRequestError extends UserFacingError {}

export interface SignedUploadAuth {
  purpose: UploadPurpose;
  tokenId: number | null;
  address: string;
  issuedAt: number;
  signature: string;
}

export async function signUploadAuth(
  signer: Signer,
  purpose: UploadPurpose,
  tokenId: number | null,
): Promise<SignedUploadAuth> {
  const address = await signer.getAddress();
  const issuedAt = Math.floor(Date.now() / 1000);
  const message = buildUploadMessage({ purpose, tokenId, address, chainId: DEPLOYMENT.chainId, issuedAt });
  const signature = await signer.signMessage(message);
  return { purpose, tokenId, address, issuedAt, signature };
}

async function readResult(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { cid?: string; error?: string } | null;
  if (!response.ok || !body?.cid) {
    throw new UploadRequestError(body?.error ?? `업로드에 실패했습니다 (HTTP ${response.status}).`);
  }
  return body.cid;
}

async function post(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { method: "POST", ...init });
  } catch {
    throw new UploadRequestError("서버에 연결하지 못했습니다. 네트워크를 확인하고 다시 시도하세요.");
  }
}

export async function uploadImage(file: File, auth: SignedUploadAuth): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("purpose", auth.purpose);
  if (auth.tokenId !== null) form.append("tokenId", String(auth.tokenId));
  form.append("address", auth.address);
  form.append("issuedAt", String(auth.issuedAt));
  form.append("signature", auth.signature);
  return readResult(await post("/api/ipfs/images", { body: form }));
}

/** 발행 메타데이터 업로드 → 메타데이터 CID (mint에는 ipfs://<cid>로 넘긴다) */
export async function uploadMetadata(
  input: MetadataInput,
  imageCid: string,
  auth: SignedUploadAuth,
): Promise<string> {
  const body = JSON.stringify({
    address: auth.address,
    issuedAt: auth.issuedAt,
    signature: auth.signature,
    name: input.name,
    description: input.description,
    image: imageCid,
  });
  return readResult(await post("/api/ipfs/metadata", { body, headers: { "Content-Type": "application/json" } }));
}

/** 재판매 상태 기록 업로드: 상태 정보 + 사진 CID (+ AI 초안 활용 여부, D14) → 상태 기록 CID */
export function uploadCondition(
  input: ConditionInput,
  images: string[],
  auth: SignedUploadAuth,
  aiAssisted = false,
): Promise<string> {
  return postCondition(auth, {
    sealed: input.sealed,
    condition: input.condition,
    defects: input.defects,
    images,
    ...(aiAssisted ? { aiAssisted: true } : {}),
  });
}

/** 최초 판매 상태 기록 업로드: 입력 없음, 서버가 대표 이미지로 작성 (D11) → 상태 기록 CID */
export function uploadPrimaryCondition(auth: SignedUploadAuth): Promise<string> {
  return postCondition(auth, {});
}

async function postCondition(auth: SignedUploadAuth, fields: Record<string, unknown>): Promise<string> {
  const body = JSON.stringify({
    tokenId: auth.tokenId,
    address: auth.address,
    issuedAt: auth.issuedAt,
    signature: auth.signature,
    ...fields,
  });
  return readResult(await post("/api/ipfs/condition", { body, headers: { "Content-Type": "application/json" } }));
}
