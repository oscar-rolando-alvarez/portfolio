import { explorerAddressUrl } from "@/lib/config";
import { shortenAddress } from "@/lib/format";

export function AddressLink({ address, chars = 4 }: { address: string; chars?: number }) {
  return (
    <a
      href={explorerAddressUrl(address)}
      target="_blank"
      rel="noopener noreferrer"
      title={address}
      className="font-mono underline decoration-border underline-offset-4 hover:decoration-accent"
    >
      {shortenAddress(address, chars)}
    </a>
  );
}
