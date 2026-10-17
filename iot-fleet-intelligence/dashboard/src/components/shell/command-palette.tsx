"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { AlertTriangle, Coins, Gauge, Languages, Map as MapIcon, MoonStar, Play, Radio, Search, Siren, Activity } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { sortedIncidents } from "@/lib/stream/reducer";
import { useStore } from "@/lib/store";

export const NAV = [
  { href: "/", key: "overview", icon: Gauge },
  { href: "/live", key: "live", icon: Activity },
  { href: "/map", key: "map", icon: MapIcon },
  { href: "/incidents", key: "incidents", icon: Siren },
  { href: "/cost", key: "cost", icon: Coins },
] as const;

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}

function Item({ onSelect, icon, children, value }: { onSelect: () => void; icon: ReactNode; children: ReactNode; value?: string }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-fg-2 aria-selected:bg-surface-3 aria-selected:text-fg [&_svg]:size-4 [&_svg]:text-fg-3"
    >
      {icon}
      <span className="truncate">{children}</span>
    </Command.Item>
  );
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations("palette");
  const tn = useTranslations("nav");
  const ti = useTranslations("incidents");
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const { resolvedTheme, setTheme } = useTheme();
  const store = useStore();
  const incidents = sortedIncidents(store.stream).slice(0, 8);
  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };
  const heading = "px-2 pt-3 pb-1 text-[11px] font-medium tracking-wide text-fg-3 uppercase [&_[cmdk-group-heading]]:px-2.5";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-fade-up" />
        <Dialog.Content
          className="fixed top-[14vh] left-1/2 z-50 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-2xl"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">{t("title")}</Dialog.Title>
          <Command label={t("title")} loop>
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search className="size-4 text-fg-3" aria-hidden />
              <Command.Input
                placeholder={t("placeholder")}
                className="h-12 w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-3"
              />
              <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-fg-3">esc</kbd>
            </div>
            <Command.List className="max-h-[52vh] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-8 text-center text-sm text-fg-3">{t("empty")}</Command.Empty>
              <Command.Group heading={t("navigate")} className={heading}>
                {NAV.map((n) => (
                  <Item key={n.href} value={tn(n.key)} icon={<n.icon />} onSelect={() => run(() => router.push(n.href))}>
                    {tn(n.key)}
                  </Item>
                ))}
              </Command.Group>
              <Command.Group heading={t("actions")} className={heading}>
                <Item
                  icon={<Play />}
                  onSelect={() =>
                    run(() => {
                      store.replayDemo(105);
                      router.push("/map");
                    })
                  }
                >
                  {t("replay")}
                </Item>
                {store.liveAvailable ? (
                  <Item icon={<Radio />} onSelect={() => run(() => store.setMode(store.mode === "live" ? "demo" : "live"))}>
                    {store.mode === "live" ? t("switchDemo") : t("switchLive")}
                  </Item>
                ) : null}
                <Item icon={<MoonStar />} onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))}>
                  {t("toggleTheme")}
                </Item>
                <Item icon={<Languages />} onSelect={() => run(() => router.replace(pathname, { locale: locale === "en" ? "es" : "en" }))}>
                  {t("switchLocale")}
                </Item>
                <Item icon={<Coins />} onSelect={() => run(() => store.setCurrency(store.currency === "USD" ? "COP" : "USD"))}>
                  {store.currency === "USD" ? t("currencyCop") : t("currencyUsd")}
                </Item>
              </Command.Group>
              {incidents.length ? (
                <Command.Group heading={t("incidents")} className={heading}>
                  {incidents.map((v) => (
                    <Item
                      key={v.incident.incident_id}
                      value={`${v.incident.incident_id} ${ti(`fault.${v.incident.suspected_fault}`)} ${v.incident.scope}`}
                      icon={<AlertTriangle />}
                      onSelect={() => run(() => router.push({ pathname: "/incidents", query: { id: v.incident.incident_id } }))}
                    >
                      {ti(`fault.${v.incident.suspected_fault}`)} · <span className="font-mono text-xs">{v.incident.scope}</span>
                    </Item>
                  ))}
                </Command.Group>
              ) : null}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
