import type { Metadata } from 'next'
import { Geist, Noto_Sans_Ethiopic } from 'next/font/google'
import './globals.css'
import { Toaster } from 'react-hot-toast'
import Providers from './providers'
import { LanguageProvider } from '@/i18n/LanguageProvider'
import { getLocale } from '@/i18n/server'

// Geist for Latin letters. Noto Sans Ethiopic covers Amharic (the browser only
// downloads it when a page actually contains Ethiopic letters).
const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' })
const ethiopic = Noto_Sans_Ethiopic({ subsets: ['ethiopic'], variable: '--font-ethiopic', display: 'swap' })

export const metadata: Metadata = {
  title: 'MugoBus — Book Bus Tickets Online',
  description: 'Book bus tickets across Ethiopia easily and securely',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  return (
    <html lang={locale}>
      <body className={`${geist.variable} ${ethiopic.variable}`}>
        <LanguageProvider initialLocale={locale}>
          <Providers>
            {children}
            <Toaster position="top-right" />
          </Providers>
        </LanguageProvider>
      </body>
    </html>
  )
}