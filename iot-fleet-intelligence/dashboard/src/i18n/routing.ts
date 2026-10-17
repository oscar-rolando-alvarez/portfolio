import { defineRouting } from "next-intl/routing";

export const locales = ["en", "es"] as const;
export type Locale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale: "en",
  localePrefix: "always",
  // The chosen locale is persisted in the NEXT_LOCALE cookie (1 year) and wins over Accept-Language.
  localeCookie: { maxAge: 60 * 60 * 24 * 365 },
});
