"use client";

import { Command as CommandIcon, Menu, Radar, Search, WifiOff, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Button, cn } from "@/components/ui/primitives";
import { Link, usePathname } from "@/i18n/navigation";
import { formatCompact } from "@/lib/format";
import { useFleetSize } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { CommandPalette, NAV, useCommandPalette } from "./command-palette";
import { CurrencyToggle, LocaleSwitcher, ModeToggle, TenantSelect, ThemeToggle } from "./controls";

function NavLinks({ onNavigate, compact }: { onNavigate?: () => void; compact?: boolean }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-0.5">
      {NAV.map((n) => {
        const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
        return (
          <li key={n.href}>
            <Link
              href={n.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              title={compact ? t(n.key) : undefined}
              className={cn(
                "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
                active ? "bg-surface-3 text-fg" : "text-fg-2 hover:bg-surface-2 hover:text-fg",
                compact && "justify-center px-0 lg:justify-start lg:px-2.5",
              )}
            >
              <n.icon className={cn("size-4 shrink-0", active ? "text-accent" : "text-fg-3 group-hover:text-fg-2")} aria-hidden />
              <span className={cn(compact && "sr-only lg:not-sr-only")}>{t(n.key)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Brand({ compact }: { compact?: boolean }) {
  const t = useTranslations("nav");
  return (
    <div className={cn("flex items-center gap-2.5 px-2.5", compact && "justify-center px-0 lg:justify-start lg:px-2.5")}>
      <div className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-accent to-[color-mix(in_oklab,var(--accent),#1baf7a_45%)] text-accent-fg shadow-sm">
        <Radar className="size-4" aria-hidden />
      </div>
      <div className={cn("leading-tight", compact && "hidden lg:block")}>
        <p className="text-[13px] font-semibold tracking-[-0.01em] text-fg">{t("product")}</p>
        <p className="text-[11px] text-fg-3">{t("tagline")}</p>
      </div>
    </div>
  );
}

function StreamBanner() {
  const t = useTranslations("mode");
  const status = useStore((s) => s.stream.status);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  if (mode !== "live" || (status !== "error" && status !== "reconnecting")) return null;
  return (
    <div
      role="alert"
      className="mx-4 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-critical/30 bg-critical-soft px-4 py-3 text-sm md:mx-6"
    >
      <WifiOff className="size-4 text-critical" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-fg">{t("errorTitle")}</p>
        <p className="text-xs text-fg-2">{t("errorBody")}</p>
      </div>
      <Button size="sm" onClick={() => setMode("demo")}>
        {t("switchToDemo")}
      </Button>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const locale = useLocale();
  const palette = useCommandPalette();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mode = useStore((s) => s.mode);
  const devices = useFleetSize();

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-accent px-3 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t("nav.skip")}
      </a>

      {/* sidebar: icon rail on tablet, full on desktop */}
      <aside className="sticky top-0 hidden h-dvh w-16 shrink-0 flex-col gap-6 border-r border-border bg-surface/60 py-4 backdrop-blur md:flex lg:w-60 lg:px-3">
        <Brand compact />
        <nav aria-label={t("nav.primary")} className="px-2 lg:px-0">
          <NavLinks compact />
        </nav>
        <div className="mt-auto hidden px-2.5 text-[11px] leading-4 text-fg-3 lg:block">
          <p className="font-medium text-fg-2">{mode === "demo" ? t("common.demoData") : t("common.liveData")}</p>
          <p>{mode === "demo" ? t("mode.demoHint") : t("mode.liveHint")}</p>
        </div>
      </aside>

      {/* mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label={t("common.close")}
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-64 flex-col gap-6 border-r border-border bg-surface p-3">
            <div className="flex items-center justify-between">
              <Brand />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label={t("common.close")}
                className="rounded-md p-1 text-fg-2"
              >
                <X className="size-4" />
              </button>
            </div>
            <nav aria-label={t("nav.primary")}>
              <NavLinks onNavigate={() => setMobileOpen(false)} />
            </nav>
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-bg/80 px-4 backdrop-blur-md md:px-6">
          <button
            type="button"
            className="grid size-8 place-items-center rounded-lg text-fg-2 hover:bg-surface-2 md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label={t("nav.openNav")}
          >
            <Menu className="size-4" />
          </button>
          <TenantSelect />
          <span className="hidden text-xs text-fg-3 tabular xl:inline">
            {t("topbar.devices", { count: formatCompact(locale, devices) })}
          </span>
          <button
            type="button"
            onClick={() => palette.setOpen(true)}
            className="ml-2 hidden h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 text-xs text-fg-3 transition-colors hover:border-border-strong hover:text-fg-2 sm:flex sm:max-w-72"
            aria-keyshortcuts="Meta+K Control+K"
          >
            <Search className="size-3.5" aria-hidden />
            <span className="truncate">{t("topbar.command")}</span>
            <kbd className="ml-auto inline-flex items-center gap-0.5 rounded border border-border px-1 font-mono text-[10px]">
              <CommandIcon className="size-2.5" aria-hidden />K
            </kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <ModeToggle />
            <div className="hidden items-center gap-2 lg:flex">
              <CurrencyToggle />
            </div>
            <LocaleSwitcher />
            <ThemeToggle />
          </div>
        </header>
        <StreamBanner />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1480px] flex-1 px-4 py-6 outline-none md:px-6 lg:py-8">
          {children}
        </main>
      </div>
      <CommandPalette open={palette.open} onOpenChange={palette.setOpen} />
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-fade-up">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-[-0.03em] text-fg md:text-[28px]">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm text-balance text-fg-3">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
