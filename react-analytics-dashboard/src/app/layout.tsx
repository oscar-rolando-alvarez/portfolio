import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Navigation } from '@/components/Layout/Navigation';
import { Sidebar } from '@/components/Layout/Sidebar';
import { ThemeProvider } from '@/components/Theme/ThemeProvider';
import { Toaster } from 'react-hot-toast';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Analytics Dashboard',
    template: '%s | Analytics Dashboard',
  },
  description: 'Advanced React 18 + Next.js 14 Analytics Dashboard with real-time data visualization',
  keywords: ['analytics', 'dashboard', 'react', 'nextjs', 'data visualization', 'charts'],
  authors: [{ name: 'Analytics Team' }],
  creator: 'Analytics Dashboard',
  publisher: 'Analytics Dashboard',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL('http://localhost:3000'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'http://localhost:3000',
    title: 'Analytics Dashboard',
    description: 'Advanced React 18 + Next.js 14 Analytics Dashboard with real-time data visualization',
    siteName: 'Analytics Dashboard',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Analytics Dashboard',
    description: 'Advanced React 18 + Next.js 14 Analytics Dashboard with real-time data visualization',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Providers>
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
              <Navigation />
              <div className="flex">
                <Sidebar />
                <main className="flex-1 ml-64 p-6 overflow-x-hidden">
                  <div className="max-w-7xl mx-auto">
                    {children}
                  </div>
                </main>
              </div>
            </div>
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 4000,
                className: 'dark:bg-gray-800 dark:text-white',
              }}
            />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}