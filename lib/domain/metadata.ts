/**
 * NFT 메타데이터 읽기 (docs/architecture.md 6.1, 6.6). 외부 의존 없음.
 * 메타데이터 JSON은 발행한 아티스트가 정한 값이므로 믿지 않고, 화면에 쓸 값만 형식을 확인해 꺼낸다.
 */
import { MAX_METADATA_NAME } from "./upload";

/** 메타데이터의 상품 이름. 비어 있지 않은 문자열이면 공백을 정리하고 길이를 제한해 돌려준다. 아니면 null */
export function parseTokenName(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const name = (value as { name?: unknown }).name;
  if (typeof name !== "string") return null;
  const oneLine = name.replace(/\s+/g, " ").trim();
  if (!oneLine) return null;
  return oneLine.length > MAX_METADATA_NAME ? `${oneLine.slice(0, MAX_METADATA_NAME)}…` : oneLine;
}
