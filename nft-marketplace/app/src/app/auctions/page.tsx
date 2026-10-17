import type { Metadata } from "next";
import { AuctionsView } from "@/components/auctions/AuctionsView";

export const metadata: Metadata = { title: "Live auctions" };

export default function AuctionsPage() {
  return <AuctionsView />;
}
