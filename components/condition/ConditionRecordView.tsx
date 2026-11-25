import type { ReactNode } from "react";
import { IpfsLink } from "@/components/ui/IpfsLink";
import { ipfsToUrl } from "@/lib/config/ipfs";
import { conditionRecordWarnings, type ConditionRecordResult } from "@/lib/domain/conditionRecord";
import { formatTimestamp } from "@/lib/domain/format";
import type { Listing } from "@/lib/domain/types";

/**
 * 거래 하나의 상품 상태 기록 (U4, architecture.md 6.6)
 * 페이지가 넘긴 조회 결과(Promise)를 기다려 표시한다. 부모가 <Suspense>로 감싼다 (ConditionRecordFallback).
 */
export async function ConditionRecordView({
  cid,
  result,
  listing,
}: {
  cid: string;
  result: Promise<ConditionRecordResult>;
  listing: Pick<Listing, "tokenId" | "seller" | "isPrimary">;
}) {
  const r = await result;
  const source = (
    <p className="text-xs text-zinc-500">
      원본 기록 <IpfsLink uri={cid} />
    </p>
  );

  if (r.status !== "ok") {
    return (
      <Box>
        <p className="text-sm text-amber-700 dark:text-amber-400">
          {r.status === "unavailable"
            ? "IPFS에서 상태 기록을 불러오지 못했습니다. 잠시 후 새로고침하세요."
            : "상태 기록 형식을 읽을 수 없습니다. 화면을 거치지 않고 등록된 기록일 수 있습니다."}
        </p>
        {source}
      </Box>
    );
  }

  const { record } = r;
  const warnings = conditionRecordWarnings(record, listing);

  return (
    <Box>
      {warnings.length > 0 && (
        <ul className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          {warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}

      {record.type === "primary" ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <Row label="상태">{record.condition}</Row>
          <Row label="사진">{record.images.length > 0 ? "발행 때 올린 대표 이미지" : "대표 이미지 없음"}</Row>
        </dl>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <Row label="개봉 여부">{record.sealed ? "미개봉" : "개봉"}</Row>
          <Row label="사용 상태">
            <span className="whitespace-pre-wrap break-words">{record.condition}</span>
          </Row>
          <Row label="하자">
            <span className="whitespace-pre-wrap break-words">{record.defects}</span>
          </Row>
        </dl>
      )}

      {record.images.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {record.images.map((image, i) => (
            <li key={image}>
              <a href={ipfsToUrl(image)} target="_blank" rel="noopener noreferrer" title="원본 사진 열기">
                {/* IPFS 게이트웨이 이미지: 원격 이미지 최적화 설정 없이 원본을 그대로 표시한다 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ipfsToUrl(image)}
                  alt={`상품 사진 ${i + 1}`}
                  loading="lazy"
                  className="h-24 w-24 rounded-lg border border-zinc-200 bg-zinc-100 object-cover dark:border-zinc-800 dark:bg-zinc-900"
                />
              </a>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-zinc-500">
        작성 {formatCreatedAt(record.createdAt)}
        {record.type === "primary" && (
          <>
            {" "}
            · 발행 정보 <IpfsLink uri={record.metadata} />
          </>
        )}
      </p>
      {source}
    </Box>
  );
}

/** <Suspense fallback>용 */
export function ConditionRecordFallback() {
  return (
    <Box>
      <p className="text-sm text-zinc-500">상태 기록 불러오는 중…</p>
    </Box>
  );
}

function Box({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">{children}</div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-zinc-500">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

function formatCreatedAt(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? iso : formatTimestamp(Math.floor(ms / 1000));
}
