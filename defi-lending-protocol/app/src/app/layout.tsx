import './globals.css'
import { Inter } from 'next/font/google'
import { WalletContextProvider } from '../contexts/WalletContextProvider'
import { ToastProvider } from '../components/ToastProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'DeFi Lending Protocol',
  description: 'A decentralized lending and borrowing platform on Solana',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <WalletContextProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </WalletContextProvider>
      </body>
    </html>
  )
}