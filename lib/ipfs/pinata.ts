import "server-only";

/**
 * Pinata 업로드 (docs/architecture.md 6.3, 7장)
 * - v3 Files API: POST https://uploads.pinata.cloud/v3/files, network=public → 응답 data.cid
 * - 꼬리표(keyvalues): 업로드 때 붙이고, GET https://api.pinata.cloud/v3/files/public?metadata[키]=값 으로 찾는다
 *   (분쟁 사유 기록, D15). 검색에는 키에 Files 읽기 권한이 필요하다
 * - PINATA_JWT는 서버 전용 환경 변수다. 오류 메시지·응답에 키나 Pinata 원본 응답을 넣지 않는다 (원본은 서버 로그).
 */

const UPLOAD_URL = "https://uploads.pinata.cloud/v3/files";
const LIST_URL = "https://api.pinata.cloud/v3/files/public";
const TIMEOUT_MS = 30_000;

/** config: 서버 설정 누락(PINATA_JWT) / upload: Pinata 업로드 실패 / list: Pinata 검색 실패 */
export class PinataError extends Error {
  constructor(
    readonly kind: "config" | "upload" | "list",
    message: string,
  ) {
    super(message);
    this.name = "PinataError";
  }
}

/** Pinata 파일 꼬리표 (값은 문자열만) */
export type PinataKeyvalues = Record<string, string>;

function readJwt(): string {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) throw new PinataError("config", "PINATA_JWT 환경 변수가 설정되지 않았습니다.");
  return jwt;
}

/** JSON 객체를 파일로 공개 IPFS에 올리고 CID를 돌려준다 */
export function uploadJson(value: unknown, name: string, keyvalues?: PinataKeyvalues): Promise<string> {
  return uploadFile(new TextEncoder().encode(JSON.stringify(value, null, 2)), name, "application/json", keyvalues);
}

/** 파일 1개를 공개 IPFS에 올리고 CID를 돌려준다 */
export async function uploadFile(
  bytes: Uint8Array,
  name: string,
  type: string,
  keyvalues?: PinataKeyvalues,
): Promise<string> {
  const jwt = readJwt();

  const form = new FormData();
  form.append("file", new Blob([bytes as BlobPart], { type }), name);
  form.append("network", "public");
  form.append("name", name);
  if (keyvalues) form.append("keyvalues", JSON.stringify(keyvalues));

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

/** 꼬리표가 모두 일치하는 공개 파일의 CID. 최근 올린 순서, 최대 limit개 */
export async function findFilesByKeyvalues(keyvalues: PinataKeyvalues, limit = 10): Promise<string[]> {
  const jwt = readJwt();
  const params = new URLSearchParams({ limit: String(limit), order: "DESC" });
  for (const [key, value] of Object.entries(keyvalues)) params.append(`metadata[${key}]`, value);

  let response: Response;
  try {
    response = await fetch(`${LIST_URL}?${params}`, {
      headers: { Authorization: `Bearer ${jwt}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    console.error("[pinata] 검색 요청 실패", error);
    throw new PinataError("list", "Pinata에 연결하지 못했습니다.");
  }
  if (!response.ok) {
    // 403이면 키에 Files 읽기 권한이 없는 경우가 많다
    console.error(`[pinata] 검색 실패 HTTP ${response.status}`, await response.text().catch(() => ""));
    throw new PinataError("list", `Pinata가 검색을 거부했습니다 (HTTP ${response.status}).`);
  }
  const body = (await response.json().catch(() => null)) as {
    data?: { files?: { cid?: unknown; keyvalues?: unknown }[] };
  } | null;
  const files = body?.data?.files;
  if (!Array.isArray(files)) {
    console.error("[pinata] 검색 응답 형식이 다릅니다", body);
    throw new PinataError("list", "Pinata 검색 응답 형식이 다릅니다.");
  }
  // 검색 조건이 무시되는 경우에 대비해 응답의 꼬리표를 다시 확인한다
  return files
    .filter((f) => {
      const kv = f.keyvalues as Record<string, unknown> | null | undefined;
      return kv && Object.entries(keyvalues).every(([key, value]) => kv[key] === value);
    })
    .map((f) => f.cid)
    .filter((cid): cid is string => typeof cid === "string" && cid.length > 0);
}
