import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { Toaster } from 'react-hot-toast'
import Providers from './providers'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'EthioBus — Book Bus Tickets Online',
  description: 'Book bus tickets across Ethiopia easily and securely',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={geist.className}>
        <Providers>
          {children}
          <Toaster position="top-right" />
        </Providers>
      </body>
    </html>
  )
}