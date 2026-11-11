import type { Metadata } from 'next'
import Link from 'next/link'
import InfoPage, { H2, P, UL, Callout } from '@/components/InfoPage'
import { SITE } from '@/lib/site'

export const metadata: Metadata = { title: 'Refund Policy — MugoBus' }

const link = { color: '#C0392B', fontWeight: 600 } as const

const th = { textAlign: 'left', padding: '10px 12px', fontSize: '12px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #EEEEEE' } as const
const td = { padding: '12px', fontSize: '14px', color: '#444', borderBottom: '1px solid #F5F5F5', verticalAlign: 'top' } as const

export default function RefundPolicyPage() {
  return (
    <InfoPage
      title="Refund Policy"
      subtitle="When you can get your money back, and how long it takes."
      updated={SITE.legalUpdated}
    >
      <H2>Seats you did not pay for</H2>
      <P>
        When you choose seats we hold them for 15 minutes. If you do not pay in that time, the seats are released and you are not charged.
        There is nothing to refund.
      </P>

      <H2>If the bus company cancels</H2>
      <P>
        If the bus company cancels your trip, or the bus does not leave, you receive a <strong>full refund of the ticket price</strong>.
        You do not need to do anything special: contact us with your ticket code if you have not heard from us.
      </P>

      <H2>If you cancel your ticket</H2>
      <P>You can cancel an online ticket yourself from <Link href="/bookings" style={link}>My Bookings</Link>. What you get back depends on how long before departure you cancel:</P>
      <div style={{ overflowX: 'auto', margin: '0 0 16px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '420px' }}>
          <thead>
            <tr><th style={th}>When you cancel</th><th style={th}>Refund</th></tr>
          </thead>
          <tbody>
            <tr><td style={td}>24 hours or more before departure</td><td style={td}>100% of the ticket price</td></tr>
            <tr><td style={td}>Between 6 and 24 hours before departure</td><td style={td}>50% of the ticket price</td></tr>
            <tr><td style={td}>Less than 6 hours before departure</td><td style={td}>No refund</td></tr>
            <tr><td style={td}>You did not show up (no-show)</td><td style={td}>No refund</td></tr>
          </tbody>
        </table>
      </div>
      <P>
        If you booked several seats, the rule applies to the seats you cancel. A ticket that has already been used to board the bus cannot be refunded.
      </P>

      <H2>Tickets bought at the counter</H2>
      <P>
        Tickets that a bus company sold you at its counter were paid to the company, not through MugoBus. Ask that company to change or cancel them.
      </P>

      <H2>How refunds are paid</H2>
      <UL>
        <li>Refunds are sent to the account you paid from, or to a phone number you give us, in the same amount of Ethiopian birr (ETB).</li>
        <li>We aim to send refunds within 7 working days after we confirm them. Your bank or mobile-money provider may need a few more days to show the money.</li>
        <li>If your refund is late, <Link href="/contact" style={link}>contact us</Link> with your ticket code.</li>
      </UL>

      <H2>Changing to another trip</H2>
      <P>
        We cannot move a ticket to a different trip. To travel at another time, cancel your ticket following the rules above and book a new one.
      </P>

      <Callout>
        Ticket prices are set by the bus companies. Payment-provider fees charged on an online payment are not always returned when a passenger
        cancels. We will always tell you the exact refund amount before we send it.
      </Callout>

      <H2>Need help with a refund?</H2>
      <P>
        <Link href="/contact" style={link}>Contact us</Link> with your ticket code and the phone number on your account.
      </P>
    </InfoPage>
  )
}
