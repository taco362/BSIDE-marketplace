/**
 * 트랜잭션 오류 → 사용자 안내 문구 (클라이언트 전용)
 *
 * 컨트랙트 custom error(architecture.md 4.1, 4.2)는 이름으로 판별해 한국어 안내로 바꾼다.
 * MetaMask가 오류를 감싸 ethers가 revert를 해석하지 못한 경우에도, 오류 객체 안의 revert data를
 * 두 컨트랙트의 ABI로 다시 해석한다 (list()처럼 에스크로 안에서 NFT 오류가 나는 경우 포함).
 */
import { isError, type ErrorDescription } from "ethers";
import { getEscrowContract, getNftContract } from "@/lib/contracts";
import { STATUS_LABELS, formatEth } from "@/lib/domain/format";
import { LISTING_STATUSES } from "@/lib/domain/types";

type Args = ErrorDescription["args"];

const REVERT_MESSAGES: Record<string, (args: Args) => string> = {
  // 공통 (OpenZeppelin)
  AccessControlUnauthorizedAccount: () =>
    "이 계정에는 권한이 없습니다. 발행은 승인된 아티스트, 아티스트 등록·회수와 분쟁 중재는 관리자 계정만 할 수 있습니다.",
  ReentrancyGuardReentrantCall: () => "중복 호출이 감지되어 거부되었습니다.",
  // BSideNFT
  EmptyTokenURI: () => "메타데이터 URI가 비어 있습니다.",
  ZeroInitialPrice: () => "최초 판매가는 0보다 커야 합니다.",
  InvalidPolicyBps: () => "정책 수치가 허용 범위를 벗어났습니다 (정가 보호형 100~150%, 창작자 상생형 1~10%).",
  EmptyArtistName: () => "활동명을 입력하세요.",
  ArtistNameTooLong: (a) => `활동명이 너무 깁니다 (${a[0]}바이트, 최대 64바이트).`,
  ZeroAddress: () => "0 주소는 사용할 수 없습니다.",
  DirectTransferToEscrow: () => "에스크로로 NFT를 직접 보낼 수 없습니다. 판매 등록 화면을 사용하세요.",
  ERC721NonexistentToken: (a) => `존재하지 않는 NFT입니다 (#${a[0]}).`,
  ERC721IncorrectOwner: () => "NFT 소유자가 아닙니다.",
  ERC721InsufficientApproval: () => "에스크로에 NFT 사용 승인이 되어 있지 않습니다. 다시 시도하세요.",
  ERC721InvalidApprover: () => "NFT 소유자만 사용 승인을 할 수 있습니다.",
  // BSideEscrow
  EscrowNotRegistered: () => "NFT 컨트랙트에 이 에스크로가 등록되어 있지 않습니다. 배포 상태를 확인하세요.",
  ListingNotFound: (a) => `거래 #${a[0]}을(를) 찾을 수 없습니다.`,
  InvalidStatus: (a) => {
    const status = LISTING_STATUSES[Number(a[1])];
    return `현재 거래 상태(${status ? STATUS_LABELS[status] : a[1]})에서는 할 수 없는 동작입니다. 새로고침 후 다시 확인하세요.`;
  },
  NotTokenOwner: () => "NFT 소유자만 판매 등록할 수 있습니다.",
  NotSeller: () => "판매자만 할 수 있는 동작입니다.",
  NotBuyer: () => "구매자만 할 수 있는 동작입니다.",
  EmptyConditionCID: () => "상품 상태 기록 CID를 입력하세요.",
  ZeroPrice: () => "판매 가격은 0보다 커야 합니다.",
  PrimaryPriceMismatch: (a) =>
    `최초 판매는 최초 판매가(${formatEth(a[0])})로만 등록할 수 있습니다 (입력 ${formatEth(a[1])}).`,
  PriceExceedsCap: (a) => `재판매 상한(${formatEth(a[0])})을 넘는 가격입니다 (입력 ${formatEth(a[1])}).`,
  SelfPurchase: () => "자신이 등록한 상품은 구매할 수 없습니다.",
  IncorrectPayment: (a) => `결제 금액이 판매 가격과 다릅니다 (가격 ${formatEth(a[0])}, 보낸 금액 ${formatEth(a[1])}).`,
  DeadlinePassed: () => "수령 승인 기한이 지나 분쟁을 제기할 수 없습니다.",
  DeadlineNotReached: () => "수령 승인 기한이 아직 지나지 않았습니다. 기한 이후에 정산을 청구할 수 있습니다.",
  NothingToWithdraw: () => "출금할 금액이 없습니다.",
  WithdrawFailed: () => "송금에 실패했습니다. 대기액은 그대로 남아 있으니 다시 시도하세요.",
};

/** 오류 객체 안에서 revert data(0x로 시작하는 4바이트 이상)를 찾는다. */
function findRevertData(error: unknown, depth = 0): string | null {
  if (!error || typeof error !== "object" || depth > 5) return null;
  const e = error as Record<string, unknown>;
  if (typeof e.data === "string" && /^0x[0-9a-fA-F]{8,}$/.test(e.data)) return e.data;
  for (const key of ["data", "error", "info", "cause", "payload"]) {
    const found = findRevertData(e[key], depth + 1);
    if (found) return found;
  }
  return null;
}

/** 오류 객체와 감싸진 오류들의 메시지 문자열 (ethers·MetaMask가 원본 오류를 error/info/cause/data 안에 넣는다) */
function collectMessages(error: unknown, depth = 0): string[] {
  if (!error || typeof error !== "object" || depth > 5) return [];
  const e = error as Record<string, unknown>;
  const own = [e.message, e.shortMessage].filter((m): m is string => typeof m === "string");
  return [...own, ...["error", "info", "cause", "data"].flatMap((key) => collectMessages(e[key], depth + 1))];
}

function decodeRevert(error: unknown): ErrorDescription | null {
  const known = (error as { revert?: { name: string; args: Args } } | null)?.revert;
  if (known?.name) return known as unknown as ErrorDescription;
  const data = findRevertData(error);
  if (!data) return null;
  for (const iface of [getEscrowContract(null).interface, getNftContract(null).interface]) {
    try {
      const parsed = iface.parseError(data);
      if (parsed) return parsed;
    } catch {
      // 다음 ABI로 시도
    }
  }
  return null;
}

export function toTxErrorMessage(error: unknown): string {
  if (isError(error, "ACTION_REJECTED")) return "MetaMask에서 서명이 거부되었습니다.";
  if ((error as { code?: unknown } | null)?.code === 4001) return "MetaMask에서 서명이 거부되었습니다.";
  if (isError(error, "INSUFFICIENT_FUNDS")) return "지갑 잔액이 부족합니다 (가격 + 가스비).";

  const revert = decodeRevert(error);
  if (revert) {
    const message = REVERT_MESSAGES[revert.name];
    return message ? message(revert.args) : `컨트랙트가 거부했습니다 (${revert.name}).`;
  }

  const text = String((error as { shortMessage?: string; message?: string } | null)?.shortMessage ??
    (error as { message?: string } | null)?.message ?? "");
  // MetaMask가 노드 오류를 감싸면 ethers 문구가 "could not coalesce error"가 되므로 안쪽 메시지까지 찾는다
  if (collectMessages(error).some((m) => /nonce/i.test(m))) {
    return "트랜잭션 순번(nonce)이 맞지 않습니다. 로컬 노드를 재시작했다면 MetaMask에서 Hardhat Local 네트워크와 이 계정을 선택한 상태로 설정 → 고급 → '활동 및 nonce 데이터 지우기'를 실행하세요. 계정마다 따로 지워야 합니다.";
  }
  if (isError(error, "CALL_EXCEPTION")) return "컨트랙트 호출이 거부되었습니다. 새로고침 후 거래 상태를 확인하세요.";
  return text ? `트랜잭션 실패: ${text}` : "트랜잭션에 실패했습니다.";
}
