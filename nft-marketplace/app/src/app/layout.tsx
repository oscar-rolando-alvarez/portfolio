'use client';

import { Inter } from 'next/font/google';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Toaster } from 'react-hot-toast';
import { WalletProvider } from '../contexts/WalletContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import { SocketProvider } from '../contexts/SocketContext';
import { MarketplaceProvider } from '../contexts/MarketplaceContext';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5, // 5 minutes
      cacheTime: 1000 * 60 * 10, // 10 minutes
    },
  },
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <WalletProvider>
              <SocketProvider>
                <MarketplaceProvider>
                  {children}
                  <Toaster
                    position="bottom-right"
                    toastOptions={{
                      duration: 4000,
                      style: {
                        background: 'hsl(var(--background))',
                        color: 'hsl(var(--foreground))',
                        border: '1px solid hsl(var(--border))',
                      },
                    }}
                  />
                </MarketplaceProvider>
              </SocketProvider>
            </WalletProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </body>
    </html>
  );
}