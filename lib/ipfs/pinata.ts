import "server-only";

/**
 * Pinata 업로드 (docs/architecture.md 6.3, 7장)
 * - v3 Files API: POST https://uploads.pinata.cloud/v3/files, network=public → 응답 data.cid
 * - PINATA_JWT는 서버 전용 환경 변수다. 오류 메시지·응답에 키나 Pinata 원본 응답을 넣지 않는다 (원본은 서버 로그).
 */

const UPLOAD_URL = "https://uploads.pinata.cloud/v3/files";
const TIMEOUT_MS = 30_000;

/** config: 서버 설정 누락(PINATA_JWT) / upload: Pinata 요청 실패 */
export class PinataError extends Error {
  constructor(
    readonly kind: "config" | "upload",
    message: string,
  ) {
    super(message);
    this.name = "PinataError";
  }
}

/** 파일 1개를 공개 IPFS에 올리고 CID를 돌려준다 */
export async function uploadFile(bytes: Uint8Array, name: string, type: string): Promise<string> {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) throw new PinataError("config", "PINATA_JWT 환경 변수가 설정되지 않았습니다.");

  const form = new FormData();
  form.append("file", new Blob([bytes as BlobPart], { type }), name);
  form.append("network", "public");
  form.append("name", name);

  let response: Response;
  try {
    response = await fetch(UPLOAD_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    console.error("[pinata] 업로드 요청 실패", error);
    throw new PinataError("upload", "Pinata에 연결하지 못했습니다.");
  }

  if (!response.ok) {
    console.error(`[pinata] 업로드 실패 HTTP ${response.status}`, await response.text().catch(() => ""));
    throw new PinataError("upload", `Pinata가 업로드를 거부했습니다 (HTTP ${response.status}).`);
  }
  const body = (await response.json().catch(() => null)) as { data?: { cid?: unknown } } | null;
  const cid = body?.data?.cid;
  if (typeof cid !== "string" || cid.length === 0) {
    console.error("[pinata] 응답에 CID가 없습니다", body);
    throw new PinataError("upload", "Pinata 응답에 CID가 없습니다.");
  }
  return cid;
}
