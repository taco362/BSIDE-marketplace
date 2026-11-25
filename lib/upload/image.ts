import "server-only";

/**
 * 사진 형식·크기 확인 (D11)
 * 형식은 브라우저가 보낸 MIME 타입이나 파일 이름이 아니라 파일 앞부분 바이트(시그니처)로 판별한다.
 */
import { MAX_IMAGE_BYTES, type ImageType } from "@/lib/domain/upload";
import { UploadError } from "./errors";

/** multipart 경계·다른 필드를 위한 여유분. Content-Length가 사진 한도 + 여유를 넘으면 본문을 읽기 전에 거부한다 */
export const MAX_REQUEST_BYTES = MAX_IMAGE_BYTES + 64 * 1024;

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((b, i) => bytes[offset + i] === b);
}

/** JPEG·PNG·WebP 판별. 그 외는 null */
export function detectImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // RIFF....WEBP
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  return null;
}

/** 요청 헤더의 Content-Length로 지나치게 큰 요청을 본문 해석 전에 거부한다 */
export function checkRequestSize(contentLength: string | null): void {
  const length = Number(contentLength);
  if (contentLength !== null && Number.isFinite(length) && length > MAX_REQUEST_BYTES) {
    throw new UploadError(413, `사진은 장당 ${MAX_IMAGE_BYTES / 1024 / 1024}MB 이하만 올릴 수 있습니다.`);
  }
}

/** 사진 파일을 확인하고 바이트와 판별된 형식을 돌려준다 */
export async function readImage(file: File): Promise<{ bytes: Uint8Array; type: ImageType }> {
  if (file.size === 0) throw new UploadError(400, "빈 파일입니다.");
  if (file.size > MAX_IMAGE_BYTES) {
    throw new UploadError(413, `사진은 장당 ${MAX_IMAGE_BYTES / 1024 / 1024}MB 이하만 올릴 수 있습니다.`);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectImageType(bytes);
  if (!type) {
    throw new UploadError(415, "JPEG, PNG, WebP 사진만 올릴 수 있습니다.");
  }
  return { bytes, type };
}
