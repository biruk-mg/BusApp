import type { Metadata } from 'next'
import Link from 'next/link'
import InfoPage, { H2, P, UL, OL } from '@/components/InfoPage'

export const metadata: Metadata = { title: 'Help Center — MugoBus' }

const link = { color: '#C0392B', fontWeight: 600 } as const

export default function HelpPage() {
  return (
    <InfoPage title="Help Center" subtitle="Everything you need to book, pay, board and manage your trip.">
      <H2>Booking a ticket</H2>
      <OL>
        <li><strong>Search.</strong> On the home page choose where you are leaving from, where you are going and the date. Only cities that have a bus route are listed.</li>
        <li><strong>Pick a trip.</strong> Compare the bus companies, departure times, bus types and prices. Each trip shows how many seats are left.</li>
        <li><strong>Choose your seat and pickup point.</strong> Tap your seat on the seat map and choose where you will board.</li>
        <li><strong>Pay online.</strong> Your seats are held for <strong>15 minutes</strong> while you pay through Chapa, our payment partner. If you do not pay in time, the seats are released automatically and nothing is charged.</li>
        <li><strong>Get your ticket.</strong> As soon as the payment is confirmed you receive a ticket with a QR code and a short ticket code.</li>
      </OL>
      <P>You need a free account to book. <Link href="/register" style={link}>Create one</Link> or <Link href="/login" style={link}>sign in</Link>.</P>

      <H2>Your ticket</H2>
      <P>
        Your tickets are always in <Link href="/bookings" style={link}>My Bookings</Link>. Open a booking to see the QR code, the short ticket code,
        the trip details, your seats and your pickup point. You do not need to print anything: show the QR code on your phone.
      </P>
      <P>
        If your phone is lost or the battery is empty, sign in on any other phone or computer and open My Bookings. You can also read the
        ticket code out to the checker.
      </P>
      <P>Keep your QR code and ticket code private. Anyone who has them could try to board with your ticket.</P>

      <H2>Boarding the bus</H2>
      <UL>
        <li>Go to the pickup point you chose. We suggest arriving at least 30 minutes before departure, or earlier if the bus company asks you to.</li>
        <li>Show your QR code (or say your ticket code) to the bus company’s staff. They check your ticket in on their phone.</li>
        <li>A ticket can be checked in once. If it has already been used to board, the staff will see a warning.</li>
        <li>Bring an ID if the bus company requires it. Each company sets its own rules.</li>
      </UL>

      <H2>Paying</H2>
      <P>
        Payments are made online through Chapa. The payment methods available are shown on the payment page. MugoBus never sees or stores your
        card number or mobile-money PIN. If a payment fails, your seats stay held until the 15 minutes are over, so you can try again.
      </P>
      <P>
        If money left your account but you have no ticket, wait a few minutes and refresh My Bookings. If the ticket still has not appeared,
        <Link href="/contact" style={link}> contact us</Link> with your phone number and the time of the payment.
      </P>

      <H2>Changing or cancelling</H2>
      <P>
        You can cancel an online ticket from My Bookings. Whether you get money back depends on how long before departure you cancel. Read the
        full <Link href="/refund-policy" style={link}>Refund Policy</Link>. Tickets bought at a bus company’s counter must be changed or cancelled by that company.
      </P>

      <H2>Something went wrong?</H2>
      <UL>
        <li><strong>The bus is late or you cannot find it:</strong> call the bus company. Its phone number is on your ticket.</li>
        <li><strong>A trip was cancelled:</strong> you are entitled to a refund. See the <Link href="/refund-policy" style={link}>Refund Policy</Link>.</li>
        <li><strong>Anything else:</strong> check the <Link href="/faq" style={link}>FAQ</Link> or <Link href="/contact" style={link}>contact us</Link>.</li>
      </UL>
    </InfoPage>
  )
}
