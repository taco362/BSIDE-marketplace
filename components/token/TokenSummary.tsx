import { AccountLabel } from "@/components/account/AccountLabel";
import { DetailItem, DetailList } from "@/components/ui/DetailList";
import { IpfsLink } from "@/components/ui/IpfsLink";
import { accountOf } from "@/lib/domain/account";
import { formatEth, isSameAddress } from "@/lib/domain/format";
import { PRIMARY_SALE_LABELS, describePolicy, formatBps, resaleCap } from "@/lib/domain/policy";
import type { AccountDirectory, PrimarySaleState, Token } from "@/lib/domain/types";
import { PolicyBadge } from "./PolicyBadge";

/** NFT 발행 정보와 재판매 정책 */
export function TokenSummary({
  token,
  accounts,
  primarySale,
}: {
  token: Token;
  accounts: AccountDirectory;
  primarySale?: PrimarySaleState;
}) {
  const cap = resaleCap(token);

  return (
    <DetailList>
      <DetailItem label="토큰 ID">#{token.tokenId}</DetailItem>
      <DetailItem label="발행 아티스트">
        <AccountLabel account={accountOf(accounts, token.artist)} full />
      </DetailItem>
      <DetailItem label="현재 소유자">
        {token.inEscrow ? (
          <span title={token.owner}>에스크로 보관 중 (판매 등록~거래 종료 동안 컨트랙트가 보관)</span>
        ) : (
          <AccountLabel
            account={accountOf(accounts, token.owner)}
            full
            note={isSameAddress(token.owner, token.artist) ? "아티스트 본인" : undefined}
          />
        )}
      </DetailItem>
      <DetailItem label="최초 판매가">{formatEth(token.initialPrice)}</DetailItem>
      <DetailItem label="재판매 정책">
        <span className="flex flex-wrap items-center gap-2">
          <PolicyBadge policy={token.policy} policyBps={token.policyBps} />
          <span className="text-zinc-600 dark:text-zinc-400">{describePolicy(token.policy, token.policyBps)}</span>
        </span>
      </DetailItem>
      {cap !== null && (
        <DetailItem label="재판매 상한 가격">
          {formatEth(cap)}{" "}
          <span className="text-zinc-500">(최초 판매가 × {formatBps(token.policyBps)}, 안내용 · 최종 검증은 컨트랙트)</span>
        </DetailItem>
      )}
      {primarySale && <DetailItem label="최초 판매">{PRIMARY_SALE_LABELS[primarySale]}</DetailItem>}
      <DetailItem label="메타데이터">
        <IpfsLink uri={token.tokenURI} />
      </DetailItem>
    </DetailList>
  );
}
