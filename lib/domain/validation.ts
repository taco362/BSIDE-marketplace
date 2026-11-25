/**
 * 거래 화면 입력 형식 확인 (화면 안내용, 외부 의존 없음)
 * 각 함수는 문제가 있으면 안내 문구, 없으면 null을 반환한다. 최종 검증은 항상 컨트랙트가 한다.
 */
import { POLICY_BPS_RANGE, formatBps } from "./policy";
import type { Policy } from "./types";

/** BSideNFT.MAX_ARTIST_NAME_BYTES */
export const MAX_ARTIST_NAME_BYTES = 64;

/** 발행 메타데이터 URI: ipfs://<CID> (architecture.md 6.4) */
export function checkMetadataUri(uri: string): string | null {
  if (!uri) return "메타데이터 URI를 입력하세요.";
  if (!/^ipfs:\/\/\S+$/.test(uri)) return "ipfs://<CID> 형식으로 입력하세요 (Pinata에 업로드한 메타데이터 JSON의 CID).";
  return null;
}

/** 상품 상태 기록 CID: ipfs:// 없이 CID만 (scripts/seed.ts와 같은 규칙) */
export function checkConditionCid(cid: string): string | null {
  if (!cid) return "상품 상태 기록 CID를 입력하세요.";
  if (cid.startsWith("ipfs://")) return "ipfs:// 없이 CID만 입력하세요.";
  if (/\s/.test(cid)) return "CID에 공백이 들어갈 수 없습니다.";
  return null;
}

/** 정책 수치 범위 (D3) */
export function checkPolicyBps(policy: Policy, bps: number | null): string | null {
  const range = POLICY_BPS_RANGE[policy];
  if (policy === "Free") return null;
  if (bps === null) return "퍼센트 값을 숫자로 입력하세요 (소수 둘째 자리까지).";
  if (bps < range.min || bps > range.max) {
    return `${formatBps(range.min)} ~ ${formatBps(range.max)} 사이로 입력하세요.`;
  }
  return null;
}

/** 지갑 주소 형식 (0x + 16진수 40자). 체크섬은 ethers와 컨트랙트 호출 시 확인된다. */
export function checkAddress(address: string): string | null {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return "0x로 시작하는 42자 지갑 주소를 입력하세요.";
  return null;
}

/** 활동명 길이: 1 ~ 64바이트 (UTF-8, 한글 약 21자) */
export function checkArtistName(name: string): string | null {
  if (!name) return "활동명을 입력하세요.";
  const bytes = new TextEncoder().encode(name).length;
  if (bytes > MAX_ARTIST_NAME_BYTES) return `활동명이 너무 깁니다 (${bytes}바이트, 최대 ${MAX_ARTIST_NAME_BYTES}바이트).`;
  return null;
}
