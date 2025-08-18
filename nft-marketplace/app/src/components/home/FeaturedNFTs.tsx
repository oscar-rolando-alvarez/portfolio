'use client';

interface FeaturedNFTsProps {
  nfts: any[];
}

export function FeaturedNFTs({ nfts }: FeaturedNFTsProps) {
  return (
    <section className="space-y-6">
      <h2 className="text-3xl font-bold">Featured NFTs</h2>
      <div className="nft-grid">
        {nfts.map((nft, index) => (
          <div key={index} className="nft-card p-4">
            <div className="aspect-square bg-muted rounded-lg mb-4" />
            <h3 className="font-semibold">{nft.name || `NFT #${index + 1}`}</h3>
            <p className="text-sm text-muted-foreground">{nft.collection || 'Unknown Collection'}</p>
            <div className="mt-2 flex justify-between items-center">
              <span className="font-bold">{nft.price || '1.5'} SOL</span>
              <button className="btn-primary btn-sm">Buy Now</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
