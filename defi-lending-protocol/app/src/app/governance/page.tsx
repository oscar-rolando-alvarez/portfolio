import type { Metadata } from "next";
import { GovernanceView } from "@/components/governance/GovernanceView";

export const metadata: Metadata = { title: "Governance" };

export default function GovernancePage() {
  return <GovernanceView />;
}
