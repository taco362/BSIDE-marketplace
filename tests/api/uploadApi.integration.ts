/**
 * 업로드·AI·권한 API 거부 테스트 (docs/architecture.md 6.3·6.5·6.7·6.8, proposal.md D12·D15)
 * 실행 중인 서버에 요청한다: `npm run test:api` (기본 http://localhost:3000, 다른 주소는 API_BASE_URL)
 *
 * - 모든 요청은 Pinata 업로드·Gemini 호출 전에 거부되어야 한다 (비용·저장 없음). 성공 응답(200 { cid })이 나오면 실패다.
 * - 서명은 매번 새로 만든 임의 지갑으로 한다. 이 지갑은 어떤 NFT의 소유자·아티스트·구매자도 아니다.
 * - 서명 문장의 체인 ID는 저장소의 lib/contracts/deployment.json 값이다 (서버도 같은 파일을 쓴다).
 * - 형식 검사(사진 바이트 판별 등)는 권한 확인 뒤에 하므로, 권한이 있는 지갑이 필요해 여기서는 다루지 않는다.
 */
import assert from "node:assert/strict";
import { before, describe, it, type TestContext } from "node:test";
import { Wallet } from "ethers";
import deployment from "@/lib/contracts/deployment.json";
import { UPLOAD_AUTH_MAX_AGE_SECONDS, buildUploadMessage, type UploadPurpose } from "@/lib/domain/upload";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
/** 체인에 없을 만큼 큰 번호 */
const MISSING_ID = 999_999_999;
const CID = "bafkreiac64jwaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

interface Result {
  status: number;
  error: string | undefined;
  body: Record<string, unknown> | null;
}

async function request(path: string, init: RequestInit = {}): Promise<Result> {
  const response = await fetch(BASE + path, { ...init, signal: AbortSignal.timeout(60_000) });
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: response.status, error: typeof body?.error === "string" ? body.error : undefined, body };
}

function postJson(path: string, body: unknown): Promise<Result> {
  return request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

function postForm(path: string, fields: Record<string, string>, files: Blob[] = [], fileField = "file"): Promise<Result> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  for (const file of files) form.append(fileField, file, "photo.png");
  return request(path, { method: "POST", body: form });
}

function expectRejected(r: Result, status: number, pattern: RegExp): void {
  assert.equal(r.body?.cid, undefined, "업로드되면 안 됩니다");
  assert.equal(r.status, status, `${r.status} ${r.error}`);
  assert.match(r.error ?? "", pattern);
}

/**
 * 체인 상태에 따라 둘 중 하나: 번호가 있으면 403(권한 없음), 없으면 400(없음).
 * 어느 쪽이든 업로드되지 않아야 한다.
 */
function expectNoPermission(t: TestContext, r: Result, forbidden: RegExp): void {
  assert.equal(r.body?.cid, undefined, "업로드되면 안 됩니다");
  if (r.status === 400) {
    assert.match(r.error ?? "", /없습니다/);
    t.diagnostic(`이 체인에 대상이 없어 400으로 확인: ${r.error}`);
    return;
  }
  expectRejected(r, 403, forbidden);
}

const now = () => Math.floor(Date.now() / 1000);

interface SignOptions {
  purpose: UploadPurpose;
  tokenId?: number | null;
  listingId?: number | null;
  issuedAt?: number;
  chainId?: number;
  wallet?: Wallet;
}

/** 업로드 확인 서명 값 (브라우저 lib/api/upload.ts와 같은 문장) */
async function signed(o: SignOptions) {
  const wallet = o.wallet ?? Wallet.createRandom();
  const fields = {
    purpose: o.purpose,
    tokenId: o.tokenId ?? null,
    listingId: o.listingId ?? null,
    address: wallet.address,
    chainId: o.chainId ?? deployment.chainId,
    issuedAt: o.issuedAt ?? now(),
  };
  const signature = await wallet.signMessage(buildUploadMessage(fields));
  return { ...fields, signature };
}

before(async () => {
  try {
    await fetch(BASE + "/api/account/roles?address=x", { signal: AbortSignal.timeout(30_000) });
  } catch {
    // before에서 던진 오류는 하위 테스트가 "cancelled"로만 보이므로 안내를 따로 출력한다
    const message = `${BASE}에 연결하지 못했습니다. 개발 서버(npm run dev)를 먼저 실행하거나 API_BASE_URL을 지정하세요.`;
    console.error(message);
    throw new Error(message);
  }
});

describe("공통 서명 확인 (상태 기록 API로 확인)", () => {
  const path = "/api/ipfs/condition";

  it("JSON이 아니면 400", async () => {
    expectRejected(await request(path, { method: "POST", body: "not json", headers: { "Content-Type": "application/json" } }), 400, /JSON/);
  });
  it("서명 없음 401", async () => {
    const s = await signed({ purpose: "condition", tokenId: 1 });
    expectRejected(await postJson(path, { ...s, signature: undefined }), 401, /서명이 없습니다/);
  });
  it("지갑 주소 형식 오류 400, NFT 번호 오류 400", async () => {
    const s = await signed({ purpose: "condition", tokenId: 1 });
    expectRejected(await postJson(path, { ...s, address: "0x1234" }), 400, /지갑 주소 형식/);
    expectRejected(await postJson(path, { ...s, tokenId: "abc" }), 400, /NFT 번호/);
  });
  it("다른 지갑의 주소를 적으면 401 (서명자 불일치)", async () => {
    const s = await signed({ purpose: "condition", tokenId: 1 });
    expectRejected(await postJson(path, { ...s, address: Wallet.createRandom().address }), 401, /일치하지 않습니다/);
  });
  it("서명한 NFT 번호와 다른 번호로 보내면 401", async () => {
    const s = await signed({ purpose: "condition", tokenId: 1 });
    expectRejected(await postJson(path, { ...s, tokenId: 2 }), 401, /일치하지 않습니다/);
  });
  it("다른 체인용 서명 401", async () => {
    const s = await signed({ purpose: "condition", tokenId: 1, chainId: deployment.chainId + 1 });
    expectRejected(await postJson(path, s), 401, /일치하지 않습니다/);
  });
  it("다른 용도(발행 메타데이터)의 서명을 재사용하면 401", async () => {
    const s = await signed({ purpose: "metadata" });
    expectRejected(await postJson(path, { ...s, tokenId: 1 }), 401, /일치하지 않습니다/);
  });
  it("만료된 서명 401, 미래 시각 서명 401", async () => {
    const old = await signed({ purpose: "condition", tokenId: 1, issuedAt: now() - UPLOAD_AUTH_MAX_AGE_SECONDS - 60 });
    expectRejected(await postJson(path, old), 401, /만료/);
    const future = await signed({ purpose: "condition", tokenId: 1, issuedAt: now() + 600 });
    expectRejected(await postJson(path, future), 401, /시계/);
  });
  it("요청이 너무 크면 413", async () => {
    expectRejected(await postJson(path, { pad: "x".repeat(20_000) }), 413, /너무 큽니다/);
  });
});

describe("상품 상태 기록 POST /api/ipfs/condition", () => {
  it("없는 NFT 400", async () => {
    expectRejected(await postJson("/api/ipfs/condition", await signed({ purpose: "condition", tokenId: MISSING_ID })), 400, /없습니다/);
  });
  it("소유자가 아니면 403 (NFT #1)", async (t) => {
    expectNoPermission(t, await postJson("/api/ipfs/condition", await signed({ purpose: "condition", tokenId: 1 })), /소유자만|에스크로에 보관/);
  });
});

describe("발행 메타데이터 POST /api/ipfs/metadata", () => {
  it("승인된 아티스트가 아니면 403", async () => {
    const s = await signed({ purpose: "metadata" });
    expectRejected(await postJson("/api/ipfs/metadata", { ...s, name: "x", description: "y", image: CID }), 403, /승인된 아티스트만/);
  });
  it("요청이 너무 크면 413", async () => {
    expectRejected(await postJson("/api/ipfs/metadata", { pad: "x".repeat(20_000) }), 413, /너무 큽니다/);
  });
});

describe("사진 POST /api/ipfs/images", () => {
  const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: "image/png" });
  const formFields = (s: Awaited<ReturnType<typeof signed>>) => ({
    purpose: s.purpose,
    address: s.address,
    issuedAt: String(s.issuedAt),
    signature: s.signature,
    ...(s.tokenId !== null ? { tokenId: String(s.tokenId) } : {}),
    ...(s.listingId !== null ? { listingId: String(s.listingId) } : {}),
  });

  it("multipart가 아니면 400", async () => {
    expectRejected(await postJson("/api/ipfs/images", {}), 400, /multipart/);
  });
  it("없는 용도 400", async () => {
    const s = await signed({ purpose: "metadata" });
    expectRejected(await postForm("/api/ipfs/images", { ...formFields(s), purpose: "avatar" }, [png]), 400, /용도/);
  });
  it("용도별 권한: 상태 기록(소유자) / 메타데이터(아티스트) / 분쟁(구매자)", async (t) => {
    const condition = await signed({ purpose: "condition", tokenId: 1 });
    expectNoPermission(t, await postForm("/api/ipfs/images", formFields(condition), [png]), /소유자만|에스크로에 보관/);
    const metadata = await signed({ purpose: "metadata" });
    expectRejected(await postForm("/api/ipfs/images", formFields(metadata), [png]), 403, /승인된 아티스트만/);
    const dispute = await signed({ purpose: "dispute", listingId: 1 });
    expectNoPermission(t, await postForm("/api/ipfs/images", formFields(dispute), [png]), /구매자만|수령 승인을 기다리는|기한이 지나/);
  });
  it("사진이 4MB를 넘으면 본문을 읽기 전에 413", async () => {
    const big = new Blob([new Uint8Array(4 * 1024 * 1024 + 128 * 1024)], { type: "image/png" });
    const s = await signed({ purpose: "metadata" });
    expectRejected(await postForm("/api/ipfs/images", formFields(s), [big]), 413, /4MB/);
  });
});

describe("분쟁 사유 POST /api/ipfs/dispute (D15)", () => {
  const path = "/api/ipfs/dispute";
  it("거래 번호 없음 400", async () => {
    const s = await signed({ purpose: "dispute", listingId: 1 });
    expectRejected(await postJson(path, { ...s, listingId: undefined }), 400, /거래 번호/);
  });
  it("서명한 거래 번호와 다르면 401", async () => {
    const s = await signed({ purpose: "dispute", listingId: 1 });
    expectRejected(await postJson(path, { ...s, listingId: 2 }), 401, /일치하지 않습니다/);
  });
  it("상품 상태 기록용 서명을 재사용하면 401", async () => {
    const s = await signed({ purpose: "condition", tokenId: 1 });
    expectRejected(await postJson(path, { ...s, listingId: 1 }), 401, /일치하지 않습니다/);
  });
  it("없는 거래 400", async () => {
    expectRejected(await postJson(path, { ...(await signed({ purpose: "dispute", listingId: MISSING_ID })), reason: "damaged", images: [] }), 400, /없습니다/);
  });
  it("구매자가 아니면 403 (거래 #1)", async (t) => {
    const s = await signed({ purpose: "dispute", listingId: 1 });
    expectNoPermission(t, await postJson(path, { ...s, reason: "damaged", images: [] }), /구매자만|수령 승인을 기다리는|기한이 지나/);
  });
  it("요청이 너무 크면 413", async () => {
    expectRejected(await postJson(path, { pad: "x".repeat(20_000) }), 413, /너무 큽니다/);
  });
});

describe("AI 상태 초안 POST /api/ai/condition-draft (Gemini 호출 전 거부)", () => {
  const path = "/api/ai/condition-draft";
  it("multipart가 아니면 400", async () => {
    expectRejected(await postJson(path, {}), 400, /multipart/);
  });
  it("서명 없음 401", async () => {
    expectRejected(await postForm(path, { tokenId: "1", address: Wallet.createRandom().address, issuedAt: String(now()) }), 401, /서명이 없습니다/);
  });
  it("소유자가 아니면 403 (NFT #1), 없는 NFT 400", async (t) => {
    const s = await signed({ purpose: "condition", tokenId: 1 });
    const fields = { tokenId: "1", address: s.address, issuedAt: String(s.issuedAt), signature: s.signature };
    expectNoPermission(t, await postForm(path, fields), /소유자만|에스크로에 보관/);
    const missing = await signed({ purpose: "condition", tokenId: MISSING_ID });
    expectRejected(
      await postForm(path, { tokenId: String(MISSING_ID), address: missing.address, issuedAt: String(missing.issuedAt), signature: missing.signature }),
      400,
      /없습니다/,
    );
  });
  it("요청이 너무 크면 413", async () => {
    const big = new Blob([new Uint8Array(4 * 1024 * 1024 + 128 * 1024)], { type: "image/png" });
    expectRejected(await postForm(path, { tokenId: "1" }, [big], "files"), 413, /너무 큽니다/);
  });
});

describe("AI 이력 요약 POST /api/ai/token-summary (Gemini 호출 전 거부)", () => {
  const path = "/api/ai/token-summary";
  it("NFT 번호 오류 400", async () => {
    for (const tokenId of [undefined, "abc", 0, -1, 1.5]) {
      expectRejected(await postJson(path, { tokenId }), 400, /NFT 번호/);
    }
  });
  it("없는 NFT 400", async () => {
    expectRejected(await postJson(path, { tokenId: MISSING_ID }), 400, /없습니다/);
  });
  it("요청이 너무 크면 413", async () => {
    expectRejected(await postJson(path, { tokenId: 1, pad: "x".repeat(2_000) }), 413, /너무 큽니다/);
  });
});

describe("권한 조회 GET /api/account/roles", () => {
  it("주소 형식 오류 400", async () => {
    expectRejected(await request("/api/account/roles?address=0x12"), 400, /주소 형식/);
  });
  it("임의 지갑은 관리자·아티스트 아님", async () => {
    const r = await request(`/api/account/roles?address=${Wallet.createRandom().address}`);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { admin: false, artist: false });
  });
});
