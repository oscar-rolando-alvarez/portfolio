"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { config } from "@/lib/config";
import { WalletButton } from "./wallet/WalletButton";

const NAV = [
  { href: "/", label: "Markets" },
  { href: "/positions", label: "My positions" },
  { href: "/governance", label: "Governance" },
] as const;

export function Header() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-bg/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-accent text-accent-fg">
            L
          </span>
          <span>Lending</span>
          <span className="badge bg-surface-muted text-muted">{config.cluster}</span>
        </Link>
        <nav aria-label="Main" className="order-3 w-full sm:order-none sm:w-auto">
          <ul className="flex gap-1 text-sm">
            {NAV.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-full px-3 py-1.5 transition ${
                      active ? "bg-surface-muted font-medium text-fg" : "text-muted hover:text-fg"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="ml-auto">
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
