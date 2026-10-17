import type { Metadata } from "next";
import { PositionsView } from "@/components/positions/PositionsView";

export const metadata: Metadata = { title: "My positions" };

export default function PositionsPage() {
  return <PositionsView />;
}
