"use client";

import { Provider as TooltipProvider } from "@radix-ui/react-tooltip";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { StreamProvider } from "./stream-provider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      <TooltipProvider delayDuration={200}>
        <StreamProvider>{children}</StreamProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
