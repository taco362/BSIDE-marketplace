import type { ReactNode } from "react";
import { IpfsLink } from "@/components/ui/IpfsLink";
import { ipfsToUrl } from "@/lib/config/ipfs";
import { disputeReasonLabel, type DisputeRecordResult } from "@/lib/domain/dispute";
import { formatTimestamp } from "@/lib/domain/format";

/**
 * 구매자가 남긴 분쟁 사유 기록 (D15, architecture.md 6.8): 관리자 중재 화면, 분쟁 중인 거래 상세
 * 페이지가 넘긴 조회 결과(Promise)를 기다려 표시한다. 부모가 <Suspense fallback={<DisputeRecordFallback />}>로 감싼다.
 */
export async function DisputeRecordView({ result }: { result: Promise<DisputeRecordResult> }) {
  const r = await result;

  if (r.status === "none") {
    return (
      <Box>
        <p className="text-sm text-zinc-500">
          분쟁 사유 기록이 없습니다. 사유 기록 기능 이전에 제기되었거나 화면을 거치지 않고 제기된 분쟁입니다.
        </p>
      </Box>
    );
  }
  if (r.status === "unavailable") {
    return (
      <Box>
        <p className="text-sm text-amber-700 dark:text-amber-400">분쟁 사유 기록을 불러오지 못했습니다. 잠시 후 새로고침하세요.</p>
      </Box>
    );
  }

  const { record, cid } = r;
  return (
    <Box>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-zinc-500">사유</dt>
        <dd className="font-medium">{disputeReasonLabel(record.reason)}</dd>
        <dt className="text-zinc-500">설명</dt>
        <dd className="whitespace-pre-wrap break-words">{record.description || "없음"}</dd>
      </dl>
      {record.images.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {record.images.map((image, i) => (
            <li key={image}>
              <a href={ipfsToUrl(image)} target="_blank" rel="noopener noreferrer" title="원본 사진 열기">
                {/* IPFS 게이트웨이 이미지: 원격 이미지 최적화 설정 없이 원본을 그대로 표시한다 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ipfsToUrl(image)}
                  alt={`구매자 사진 ${i + 1}`}
                  loading="lazy"
                  className="h-24 w-24 rounded-lg border border-zinc-200 bg-zinc-100 object-cover dark:border-zinc-800 dark:bg-zinc-900"
                />
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-zinc-500">
        작성 {formatCreatedAt(record.createdAt)} · 원본 기록 <IpfsLink uri={cid} />
      </p>
    </Box>
  );
}

/** <Suspense fallback>용 */
export function DisputeRecordFallback() {
  return (
    <Box>
      <p className="text-sm text-zinc-500">분쟁 사유 불러오는 중…</p>
    </Box>
  );
}

function Box({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-red-200 p-3 dark:border-red-900">{children}</div>
  );
}

function formatCreatedAt(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? iso : formatTimestamp(Math.floor(ms / 1000));
}
