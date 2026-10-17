import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// Locale negotiation: cookie (user choice) > Accept-Language > default; always prefixes /en or /es.
export default createMiddleware(routing);

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
