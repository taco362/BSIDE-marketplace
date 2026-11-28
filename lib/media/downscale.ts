/**
 * 브라우저에서 사진 줄이기 (클라이언트 전용, docs/architecture.md 6.7 A2)
 * AI 초안 요청에만 쓴다. IPFS에 올리는 원본 사진은 줄이지 않는다.
 */

/** 긴 변을 maxSide(px) 이하로 줄인 JPEG. 이미 작으면 다시 인코딩만 한다 (EXIF 등 메타데이터 제거) */
export async function downscaleToJpeg(file: File, maxSide: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas 2d를 사용할 수 없습니다.");
    context.drawImage(bitmap, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("JPEG 변환 실패"))), "image/jpeg", 0.85),
    );
  } finally {
    bitmap.close();
  }
}
