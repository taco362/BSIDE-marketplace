import { STATUS_LABELS } from "@/lib/domain/format";
import type { ListingStatus } from "@/lib/domain/types";

const STATUS_STYLES: Record<ListingStatus, string> = {
  LISTED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  LOCKED: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  COMPLETED: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  CANCELLED: "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500",
  DISPUTED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export function ListingStatusBadge({ status }: { status: ListingStatus }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
