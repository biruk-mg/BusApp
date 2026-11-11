import type { Metadata } from 'next'
import Link from 'next/link'
import InfoPage, { H2, P, UL } from '@/components/InfoPage'
import { SITE } from '@/lib/site'

export const metadata: Metadata = { title: 'Privacy Policy — MugoBus' }

const link = { color: '#C0392B', fontWeight: 600 } as const

export default function PrivacyPage() {
  return (
    <InfoPage
      title="Privacy Policy"
      subtitle="What information MugoBus collects, why, and who can see it."
      updated={SITE.legalUpdated}
    >
      <P>
        MugoBus (“we”, “us”) is an online service where passengers book bus tickets from bus companies. This policy explains how we handle
        your personal information when you use the MugoBus website and apps.
      </P>

      <H2>Information we collect</H2>
      <UL>
        <li><strong>Account details:</strong> your name, your phone number and, if you give it, your email address. Your password is stored in a scrambled (hashed) form, so nobody can read it.</li>
        <li><strong>Booking details:</strong> the trips you book, your seats, your pickup point, your ticket code and the status of your booking.</li>
        <li><strong>Payment details:</strong> payments are handled by our payment partner, Chapa. We receive the payment reference, the amount and whether it succeeded. We do not see or store your card number or mobile-money PIN.</li>
        <li><strong>Browser storage:</strong> we keep a sign-in token in your browser so you stay signed in. We do not use advertising cookies.</li>
      </UL>

      <H2>How we use it</H2>
      <UL>
        <li>To create your account and let you sign in.</li>
        <li>To reserve your seats, confirm your payment and issue your ticket.</li>
        <li>To let the bus company check you in and run the trip.</li>
        <li>To handle cancellations, refunds, payments to bus companies and support requests.</li>
        <li>To keep the service secure, prevent fraud and fix problems.</li>
      </UL>

      <H2>Who can see your information</H2>
      <UL>
        <li><strong>The bus company running your trip</strong> sees your name, phone number, seats and pickup point, so it can board you and contact you about the trip. Its staff only see passengers on its own trips.</li>
        <li><strong>Chapa</strong> processes your payment under its own privacy rules.</li>
        <li><strong>Our service providers</strong> (for example cloud hosting and database providers) store and process data for us, only to run MugoBus.</li>
        <li><strong>Authorities</strong>, if the law requires us to share information.</li>
      </UL>
      <P>We do not sell your personal information.</P>

      <H2>How long we keep it</H2>
      <P>
        We keep your account while you use MugoBus. We keep booking and payment records for as long as needed for refunds, accounting and legal
        reasons, even if you stop using the service.
      </P>

      <H2>Keeping it safe</H2>
      <P>
        We protect your information with passwords that cannot be read, secure connections and access limited to the people who need it. No
        online service can be perfectly secure, so please keep your password, QR code and ticket code private.
      </P>

      <H2>Your choices</H2>
      <P>
        You can ask us to correct your information or to delete your account. Some booking and payment records must be kept for legal and
        accounting reasons. <Link href="/contact" style={link}>Contact us</Link> to make a request.
      </P>

      <H2>Children</H2>
      <P>MugoBus accounts are for adults. Children can travel on a ticket booked by an adult.</P>

      <H2>Changes to this policy</H2>
      <P>If we change this policy we will update the date at the top of the page. Please check it from time to time.</P>

      <H2>Questions</H2>
      <P>If you have a question about your information, <Link href="/contact" style={link}>contact us</Link>.</P>
    </InfoPage>
  )
}
