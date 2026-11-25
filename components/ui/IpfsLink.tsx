import { ipfsToUrl } from "@/lib/config/ipfs";

const TEXT_CLASS = "break-all font-mono text-sm";

/**
 * IPFS URI·CID를 공개 게이트웨이 링크로 표시.
 * 온체인 값·IPFS 기록은 누구나 정할 수 있으므로, http(s) 주소가 되지 않는 값(javascript: 등)은 링크 없이 글자로만 표시한다.
 */
export function IpfsLink({ uri }: { uri: string }) {
  const url = ipfsToUrl(uri);
  if (!/^https?:\/\//i.test(url)) return <span className={TEXT_CLASS}>{uri}</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${TEXT_CLASS} underline decoration-zinc-400 underline-offset-2 hover:decoration-current`}
    >
      {uri}
    </a>
  );
}
