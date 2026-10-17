import { ListingsView } from "@/components/listings/ListingsView";
import { MarketplaceStats } from "@/components/stats/MarketplaceStats";
import { AddressLink } from "@/components/ui/AddressLink";
import { config } from "@/lib/config";

export default function ExplorePage() {
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Discover, list and bid on NFTs</h1>
          <p className="max-w-2xl text-muted">
            Escrow-free fixed-price listings, offers and auctions on Solana. Data is read live from
            program <AddressLink address={config.marketplaceProgramId} /> on {config.cluster}; no
            wallet needed to browse.
          </p>
        </div>
        <MarketplaceStats />
      </section>
      <ListingsView />
    </div>
  );
}
