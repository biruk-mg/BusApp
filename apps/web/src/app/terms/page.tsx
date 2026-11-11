import type { Metadata } from 'next'
import Link from 'next/link'
import InfoPage, { H2, P, UL } from '@/components/InfoPage'
import { SITE } from '@/lib/site'

export const metadata: Metadata = { title: 'Terms of Service — MugoBus' }

const link = { color: '#C0392B', fontWeight: 600 } as const

export default function TermsPage() {
  return (
    <InfoPage
      title="Terms of Service"
      subtitle="The rules for using MugoBus. Please read them before you book."
      updated={SITE.legalUpdated}
    >
      <P>By creating an account or booking a ticket on MugoBus you agree to these terms.</P>

      <H2>1. What MugoBus is</H2>
      <P>
        MugoBus is an online platform that lets you find and book bus tickets from bus companies. We do not own or run the buses. When you buy a
        ticket, your trip is provided by the bus company named on the ticket, and MugoBus arranges the booking and the payment.
      </P>

      <H2>2. Your account</H2>
      <UL>
        <li>Give correct information and keep it up to date.</li>
        <li>Keep your password private. You are responsible for what happens under your account.</li>
        <li>Tell us if you think someone else is using your account.</li>
      </UL>

      <H2>3. Booking and payment</H2>
      <UL>
        <li>Prices are shown in Ethiopian birr (ETB) and are set by the bus companies.</li>
        <li>Seats you choose are held for 15 minutes. If the payment is not completed in that time, the seats are released.</li>
        <li>Your booking is confirmed when the payment is confirmed. You then receive a ticket with a QR code and a ticket code.</li>
        <li>Payments are processed by Chapa. We never see or store your card number or mobile-money PIN.</li>
        <li>A price change on a trip does not change a booking that is already confirmed.</li>
      </UL>

      <H2>4. Your ticket</H2>
      <UL>
        <li>The ticket is for the trip, date and seats shown on it.</li>
        <li>Keep your QR code and ticket code private. A ticket can be checked in once, and anyone who presents it first may board.</li>
        <li>Tickets that are copied, changed or used in a misleading way will be refused.</li>
      </UL>

      <H2>5. Travelling</H2>
      <UL>
        <li>Be at your pickup point before the departure time. We suggest at least 30 minutes early.</li>
        <li>The bus company is responsible for the journey: the vehicle, the driver, safety, luggage rules, delays and pickup times. Follow the company’s reasonable instructions and carry an ID if the company asks for one.</li>
        <li>If you miss the bus, your ticket is treated as a no-show.</li>
      </UL>

      <H2>6. Cancellations and refunds</H2>
      <P>
        Refunds follow our <Link href="/refund-policy" style={link}>Refund Policy</Link>. If a bus company cancels a trip, you receive a full refund of the ticket price.
      </P>

      <H2>7. Changes by the bus company</H2>
      <P>
        Bus companies can change a vehicle, a departure time or a pickup point, or cancel a trip. We will try to let you know, but we cannot
        control the bus company. Please check your ticket before you travel.
      </P>

      <H2>8. Acceptable use</H2>
      <P>You agree not to:</P>
      <UL>
        <li>make false bookings, or hold seats you do not intend to pay for;</li>
        <li>use the service to break the law or to harm other people;</li>
        <li>try to break into MugoBus, overload it or copy its data automatically;</li>
        <li>sell or share tickets in a way that is dishonest or misleading.</li>
      </UL>
      <P>We may suspend or close accounts that break these rules.</P>

      <H2>9. Our responsibility</H2>
      <P>
        We work to keep MugoBus available and accurate, but we cannot promise that it will always work without interruption or errors.
        We are not responsible for what bus companies do or fail to do, including accidents, delays, cancellations, and lost or damaged luggage.
        To the extent the law allows, our responsibility to you for a booking is limited to the price you paid for that ticket. Nothing in these
        terms removes rights that the law does not allow to be removed.
      </P>

      <H2>10. Privacy</H2>
      <P>How we handle your information is explained in our <Link href="/privacy" style={link}>Privacy Policy</Link>.</P>

      <H2>11. Changes to these terms</H2>
      <P>
        We may update these terms. The date at the top shows when they last changed. If you keep using MugoBus after a change, you accept the
        new terms. Bookings you already made are not affected.
      </P>

      <H2>12. Governing law</H2>
      <P>
        These terms are governed by the laws of Ethiopia. If we cannot solve a problem by talking, the competent courts of Addis Ababa will decide it.
      </P>

      <H2>13. Contact</H2>
      <P>Questions about these terms? <Link href="/contact" style={link}>Contact us</Link>.</P>
    </InfoPage>
  )
}
