import type { Metadata } from 'next'
import Link from 'next/link'
import InfoPage, { H2, P, UL } from '@/components/InfoPage'
import { SITE } from '@/lib/site'

export const metadata: Metadata = { title: 'Contact — MugoBus' }

const link = { color: '#C0392B', fontWeight: 600 } as const

export default function ContactPage() {
  const channels = [
    SITE.supportPhone && { label: 'Phone', value: SITE.supportPhone, href: `tel:${SITE.supportPhone.replace(/\s+/g, '')}` },
    SITE.supportEmail && { label: 'Email', value: SITE.supportEmail, href: `mailto:${SITE.supportEmail}` },
    SITE.supportTelegram && { label: 'Telegram', value: SITE.supportTelegram.replace(/^https?:\/\//, ''), href: SITE.supportTelegram },
  ].filter(Boolean) as { label: string; value: string; href: string }[]

  return (
    <InfoPage title="Contact us" subtitle="We are here to help with your booking, payment or ticket.">
      {channels.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '8px' }}>
          {channels.map((c) => (
            <a key={c.label} href={c.href} style={{ display: 'block', textDecoration: 'none', border: '1px solid #EEEEEE', borderRadius: '12px', padding: '16px', background: '#FAFAFA' }}>
              <div style={{ fontSize: '11px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>{c.label}</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a', wordBreak: 'break-word' }}>{c.value}</div>
            </a>
          ))}
        </div>
      ) : (
        <P>Our support contact details will be published here soon. Meanwhile, the Help Center and FAQ answer most questions.</P>
      )}

      <H2>Before you contact us</H2>
      <P>Please have these ready so we can help you faster:</P>
      <UL>
        <li>The phone number on your MugoBus account</li>
        <li>Your ticket code (you can find it in <Link href="/bookings" style={link}>My Bookings</Link>)</li>
        <li>The route, the date and the bus company</li>
        <li>For payment problems: the time of the payment and the amount</li>
      </UL>

      <H2>Problem on the day of travel?</H2>
      <P>
        For a late bus, a changed pickup time or luggage questions, call the bus company directly. Its phone number is printed on your ticket.
        They know where your bus is.
      </P>

      <H2>Refunds</H2>
      <P>Read our <Link href="/refund-policy" style={link}>Refund Policy</Link> first. If your refund is late, contact us with your ticket code.</P>

      <H2>Bus companies</H2>
      <P>
        Do you run buses and want to sell your tickets on MugoBus? Get in touch using the details above. You will get your own dashboard to manage
        buses, trips, pickup points and sales, and to see your earnings.
      </P>
    </InfoPage>
  )
}
