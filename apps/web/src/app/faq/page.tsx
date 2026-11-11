import type { Metadata } from 'next'
import Link from 'next/link'
import InfoPage from '@/components/InfoPage'

export const metadata: Metadata = { title: 'FAQ — MugoBus' }

const link = { color: '#C0392B', fontWeight: 600 } as const

const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: 'Do I need an account to book?',
    a: <>Yes. A free account lets you keep all your tickets in one place. <Link href="/register" style={link}>Create an account</Link> with your name and phone number.</>,
  },
  {
    q: 'How do I pay?',
    a: 'You pay online through Chapa, our payment partner. The available payment methods are shown on the payment page. Your booking is confirmed as soon as the payment is confirmed.',
  },
  {
    q: 'How long are my seats held?',
    a: 'For 15 minutes after you choose them. If the payment is not completed in that time, the seats are released for other passengers and you are not charged.',
  },
  {
    q: 'Where is my ticket?',
    a: <>In <Link href="/bookings" style={link}>My Bookings</Link>. Open the booking to see your QR code and the short ticket code. You do not need to print it.</>,
  },
  {
    q: 'I paid but I do not see my ticket.',
    a: <>Wait a few minutes and refresh My Bookings. If it still does not appear, <Link href="/contact" style={link}>contact us</Link> with your phone number and the time you paid, and we will check it.</>,
  },
  {
    q: 'Can I choose my seat?',
    a: 'Yes. After you pick a trip you see the seat map of the bus, with the free seats you can choose.',
  },
  {
    q: 'What is a pickup point?',
    a: 'It is the place where the bus picks you up. You choose it when you book, and it is printed on your ticket. Be there before the departure time.',
  },
  {
    q: 'I lost my phone or my ticket. What do I do?',
    a: 'Sign in to your account on any phone or computer and open My Bookings. Your ticket and ticket code will be there.',
  },
  {
    q: 'Can I book for someone else?',
    a: 'Yes. You can book several seats on one booking and give them the QR code or ticket code to show when boarding. Remember that anyone who has the code can use the ticket.',
  },
  {
    q: 'Can I cancel my ticket?',
    a: <>Yes, from My Bookings. How much you get back depends on when you cancel. See the <Link href="/refund-policy" style={link}>Refund Policy</Link>.</>,
  },
  {
    q: 'The bus was cancelled. What now?',
    a: 'If the bus company cancels a trip or the bus does not leave, you receive a full refund of the ticket price.',
  },
  {
    q: 'How much luggage can I take?',
    a: 'Luggage rules are set by each bus company. If you travel with large or many bags, ask the company before you travel. Its phone number is on your ticket.',
  },
  {
    q: 'Is my payment safe?',
    a: 'Payments are handled by Chapa. MugoBus does not see or store your card number or mobile-money PIN.',
  },
  {
    q: 'Which bus companies are on MugoBus?',
    a: 'Companies are added by our team and give us their licence details. You can see the company name on every trip before you book.',
  },
  {
    q: 'Can I still buy a ticket at the station?',
    a: 'Many bus companies also sell tickets at their own counter. A ticket bought at the counter is also checked in with a QR or ticket code, but it must be changed or cancelled through that company.',
  },
]

export default function FaqPage() {
  return (
    <InfoPage title="Frequently asked questions" subtitle="Quick answers to the things passengers ask us most.">
      <style>{`
        .faq-item { border-bottom: 1px solid #F0F0F0; }
        .faq-item:last-child { border-bottom: none; }
        .faq-item summary { cursor: pointer; padding: 16px 0; font-size: 15px; font-weight: 600; color: #1a1a1a; list-style: none; display: flex; justify-content: space-between; gap: 12px; }
        .faq-item summary::-webkit-details-marker { display: none; }
        .faq-item summary::after { content: '+'; color: #C0392B; font-size: 20px; line-height: 1; }
        .faq-item[open] summary::after { content: '–'; }
        .faq-item .faq-a { padding: 0 0 16px; font-size: 14.5px; color: #555; line-height: 1.75; }
      `}</style>
      {FAQS.map((f) => (
        <details key={f.q} className="faq-item">
          <summary>{f.q}</summary>
          <div className="faq-a">{f.a}</div>
        </details>
      ))}
      <p style={{ fontSize: '14px', color: '#777', marginTop: '20px' }}>
        Did not find your answer? Visit the <Link href="/help" style={link}>Help Center</Link> or <Link href="/contact" style={link}>contact us</Link>.
      </p>
    </InfoPage>
  )
}
