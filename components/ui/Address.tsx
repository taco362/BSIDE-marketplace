import { shortenAddress } from "@/lib/domain/format";

/** 축약 주소 표시. 마우스를 올리면 전체 주소가 보인다. */
export function Address({ address }: { address: string }) {
  return (
    <span title={address} className="font-mono">
      {shortenAddress(address)}
    </span>
  );
}
