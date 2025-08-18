'use client';

export function HeroSection() {
  return (
    <section className="py-24 text-center">
      <h1 className="text-6xl font-bold mb-6 gradient-text">
        Discover, Create & Trade NFTs
      </h1>
      <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
        The most advanced NFT marketplace on Solana with real-time bidding, 
        comprehensive analytics, and cutting-edge features.
      </p>
      <div className="flex gap-4 justify-center">
        <button className="btn-primary text-lg px-8 py-4">
          Explore NFTs
        </button>
        <button className="btn-outline text-lg px-8 py-4">
          Create Collection
        </button>
      </div>
    </section>
  );
}
