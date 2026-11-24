import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="text-xl font-semibold">찾을 수 없습니다</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">요청한 거래나 NFT가 존재하지 않습니다.</p>
      <Link href="/" className="text-sm underline underline-offset-2">
        판매 목록으로
      </Link>
    </div>
  );
}
