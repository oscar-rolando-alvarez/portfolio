"use client";

import { Moon, Radio, Sun } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useEffect, useState, useTransition } from "react";
import { cn, Segmented } from "@/components/ui/primitives";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { DEMO_TENANTS } from "@/lib/stream/demo";
import { useStore } from "@/lib/store";

export function LocaleSwitcher() {
  const t = useTranslations("topbar");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  return (
    <div className={cn(pending && "opacity-60")} data-testid="locale-switcher">
      <Segmented
        label={t("locale")}
        value={locale}
        options={[
          { value: "en", label: "EN" },
          { value: "es", label: "ES" },
        ]}
        onChange={(next) =>
          start(() => {
            // next-intl persists the choice in the NEXT_LOCALE cookie
            router.replace({ pathname, query: Object.fromEntries(new URLSearchParams(window.location.search)) }, { locale: next });
          })
        }
      />
    </div>
  );
}

export function ThemeToggle() {
  const t = useTranslations("topbar");
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- avoid hydration mismatch for the icon
  useEffect(() => setMounted(true), []);
  const dark = !mounted || resolvedTheme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={t("theme")}
      title={dark ? t("themeLight") : t("themeDark")}
      className="grid size-8 place-items-center rounded-lg text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg"
    >
      {dark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
    </button>
  );
}

export function CurrencyToggle() {
  const t = useTranslations("topbar");
  const currency = useStore((s) => s.currency);
  const setCurrency = useStore((s) => s.setCurrency);
  return (
    <Segmented
      label={t("currency")}
      value={currency}
      options={[
        { value: "USD", label: "USD" },
        { value: "COP", label: "COP" },
      ]}
      onChange={setCurrency}
    />
  );
}

export function TimeRangeControl() {
  const t = useTranslations("topbar");
  const range = useStore((s) => s.timeRange);
  const set = useStore((s) => s.setTimeRange);
  return (
    <Segmented
      label={t("timeRange")}
      value={range}
      options={[
        { value: 300, label: t("range5") },
        { value: 900, label: t("range15") },
      ]}
      onChange={set}
    />
  );
}

export function TenantSelect() {
  const t = useTranslations("topbar");
  const tenant = useStore((s) => s.tenant);
  const setTenant = useStore((s) => s.setTenant);
  const mode = useStore((s) => s.mode);
  const liveTenant = useStore((s) => s.stream.tenant);
  const options = mode === "live" ? [{ id: liveTenant, name: liveTenant }] : DEMO_TENANTS;
  return (
    <label className="relative flex items-center">
      <span className="sr-only">{t("tenant")}</span>
      <select
        value={mode === "live" ? liveTenant : tenant}
        onChange={(e) => setTenant(e.target.value)}
        disabled={mode === "live"}
        className="h-8 max-w-44 appearance-none truncate rounded-lg border border-border bg-surface-2 pr-7 pl-2.5 text-xs font-medium text-fg hover:bg-surface-3 focus-visible:outline-2"
        data-testid="tenant-select"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute right-2 size-3 text-fg-3">
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </label>
  );
}

/** Live / Demo switch with a connection-status dot that always says which one you are looking at. */
export function ModeToggle() {
  const t = useTranslations("mode");
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const live = useStore((s) => s.liveAvailable);
  const status = useStore((s) => s.stream.status);
  const color = status === "open" ? (mode === "live" ? "text-good" : "text-accent") : status === "error" ? "text-critical" : "text-warning";
  return (
    <div className="flex items-center gap-2" data-testid="mode-toggle">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-[11px] font-semibold tracking-wide uppercase",
          color,
        )}
        title={mode === "live" ? t("liveHint") : t("demoHint")}
        data-testid="mode-badge"
      >
        <span className={cn("size-1.5 rounded-full bg-current", status === "open" && "live-dot")} aria-hidden />
        {mode === "live" ? t("live") : t("demo")}
        <span className="sr-only"> — {t(`status.${status}`)}</span>
      </span>
      <Segmented
        label={t("label")}
        value={mode}
        options={[
          { value: "demo", label: t("demo") },
          {
            value: "live",
            disabled: !live,
            title: live ? t("liveHint") : t("liveUnavailable"),
            label: (
              <span className="inline-flex items-center gap-1">
                <Radio className="size-3" aria-hidden />
                {t("live")}
              </span>
            ),
          },
        ]}
        onChange={(m) => {
          if (m === "live" && !live) return;
          setMode(m);
        }}
      />
    </div>
  );
}
