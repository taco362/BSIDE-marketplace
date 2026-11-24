import { ipfsToUrl } from "@/lib/config/ipfs";

/** IPFS URI·CID를 공개 게이트웨이 링크로 표시 */
export function IpfsLink({ uri }: { uri: string }) {
  return (
    <a
      href={ipfsToUrl(uri)}
      target="_blank"
      rel="noopener noreferrer"
      className="break-all font-mono text-sm underline decoration-zinc-400 underline-offset-2 hover:decoration-current"
    >
      {uri}
    </a>
  );
}
