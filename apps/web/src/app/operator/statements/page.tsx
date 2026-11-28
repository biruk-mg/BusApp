'use client'

import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { errorOf, PAYOUT_METHOD_LABEL, PayoutMethod } from '@/lib/admin'
import { formatPrice } from '@bus/utils'
import { FileText, Printer, Download } from 'lucide-react'
import toast from 'react-hot-toast'

interface PayoutItem { id: string; paidAt: string; method: PayoutMethod; reference: string | null; note: string | null; amount: number }
interface VoidedItem { id: string; paidAt: string; method: PayoutMethod; reference: string | null; amount: number; reason: string | null }
interface TripLine { scheduleId: string; departureTime: string; route: string; tickets: number; seats: number; ticketValue: number; refunded: number; earned: number; commission: number; net: number }
interface Statement {
  company: { id: string; companyName: string }
  month: string
  label: string
  generatedAt: string
  inProgress: boolean
  basis: string
  openingBalance: number
  online: { tickets: number; seats: number; ticketValue: number; refunded: number; earned: number; commission: number; net: number }
  payouts: { total: number; items: PayoutItem[]; voided: VoidedItem[] }
  closingBalance: number
  stillToDepart: { net: number }
  fullRefunds: { tickets: number; amount: number }
  counter: { tickets: number; seats: number; total: number; byMethod: { method: string; tickets: number; seats: number; total: number }[]; voided: { tickets: number; total: number } }
  trips: TripLine[]
}

const card: React.CSSProperties = { background: 'white', border: '1px solid #F0F0F0', borderRadius: '16px', padding: '18px 20px' }
const th: React.CSSProperties = { textAlign: 'left', fontSize: '11px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, padding: '8px 10px', borderBottom: '1px solid #EEE', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { fontSize: '13px', color: '#1a1a1a', padding: '9px 10px', borderBottom: '1px solid #F5F5F5', whiteSpace: 'nowrap' }
const num: React.CSSProperties = { textAlign: 'right' }
const input: React.CSSProperties = { border: '1px solid #DDD', borderRadius: '8px', padding: '8px 10px', fontSize: '13px', background: 'white' }
const button: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '6px', border: '1px solid #DDD', background: 'white', borderRadius: '10px', padding: '9px 14px', fontSize: '13px', fontWeight: 600, color: '#1a1a1a', cursor: 'pointer' }

const TZ = 'Africa/Addis_Ababa'
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' })
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
const money = (n: number) => (n < 0 ? `- ${formatPrice(-n)}` : formatPrice(n))

/** The last 12 months, newest first, as "2026-11" in Addis time. */
function recentMonths(): { value: string; label: string }[] {
  const now = new Date()
  const [y, m] = new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 7).split('-').map(Number)
  return Array.from({ length: 12 }, (_, k) => {
    const index = y * 12 + (m - 1) - k
    const year = Math.floor(index / 12)
    const month = (index % 12) + 1
    const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    return { value: `${year}-${String(month).padStart(2, '0')}`, label }
  })
}

// An error from a file download arrives as a blob, so read the message out of it
async function blobError(err: unknown, fallback: string): Promise<string> {
  const data = (err as { response?: { data?: unknown } })?.response?.data
  if (data instanceof Blob) {
    try { return JSON.parse(await data.text()).error || fallback } catch { return fallback }
  }
  return errorOf(err, fallback)
}

async function download(path: string, params: Record<string, string>) {
  const res = await api.get(path, { params, responseType: 'blob' })
  const name = /filename="([^"]+)"/.exec(String(res.headers['content-disposition'] ?? ''))?.[1] ?? 'mugobus.csv'
  const url = URL.createObjectURL(res.data as Blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function Row({ label, value, strong, note }: { label: string; value: string; strong?: boolean; note?: string }) {
  return (
    <tr>
      <td style={{ ...td, whiteSpace: 'normal', fontWeight: strong ? 700 : 400, borderTop: strong ? '2px solid #1a1a1a' : undefined }}>
        {label}
        {note && <div style={{ fontSize: '11px', color: '#999', marginTop: '2px', fontWeight: 400 }}>{note}</div>}
      </td>
      <td style={{ ...td, ...num, fontWeight: strong ? 700 : 400, borderTop: strong ? '2px solid #1a1a1a' : undefined }}>{value}</td>
    </tr>
  )
}

export default function OperatorStatementsPage() {
  const months = useMemo(recentMonths, [])
  const [month, setMonth] = useState(months[0].value)
  const [data, setData] = useState<Statement | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [from, setFrom] = useState(`${months[0].value}-01`)
  const [to, setTo] = useState(new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10))

  useEffect(() => {
    setLoading(true)
    api.get('/operator/statement', { params: { month } })
      .then((res) => setData(res.data.data))
      .catch((err) => { setData(null); toast.error(errorOf(err, 'Failed to load the statement')) })
      .finally(() => setLoading(false))
  }, [month])

  const run = async (path: string, params: Record<string, string>) => {
    setBusy(true)
    try { await download(path, params) } catch (err) { toast.error(await blobError(err, 'Download failed')) } finally { setBusy(false) }
  }

  return (
    <div>
      <style>{`@media print {
        .dash-sidebar, .dash-topbar, .dash-backdrop, .no-print { display: none !important; }
        .dash-main { margin-left: 0 !important; padding: 0 !important; }
        body { background: white !important; }
        .sheet-card { border: none !important; padding: 0 !important; break-inside: avoid; }
      }`}</style>

      <h1 className="no-print" style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <FileText size={22} color="#C0392B" /> Statements
      </h1>

      <div className="no-print" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' }}>
        <select value={month} onChange={(e) => setMonth(e.target.value)} style={input} aria-label="Month">
          {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <button style={button} onClick={() => window.print()} disabled={!data}><Printer size={15} /> Print / Save as PDF</button>
        <button style={button} onClick={() => run('/operator/statement.csv', { month })} disabled={busy || !data}><Download size={15} /> Download for Excel (CSV)</button>
      </div>

      {loading && <p style={{ color: '#999', fontSize: '13px' }}>Loading...</p>}

      {data && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="sheet-card" style={card}>
            <div style={{ fontSize: '18px', fontWeight: 700 }}>{data.company.companyName}</div>
            <div style={{ fontSize: '14px', color: '#555', marginTop: '2px' }}>Statement for {data.label}</div>
            <div style={{ fontSize: '12px', color: '#999', marginTop: '6px', lineHeight: 1.6 }}>
              {data.basis}. Generated {day(data.generatedAt)}, {clock(data.generatedAt)} (Addis time).
            </div>
            {data.inProgress && (
              <div style={{ background: '#FFF4E5', border: '1px solid #F0D58C', color: '#8A5A00', borderRadius: '10px', padding: '8px 12px', fontSize: '12px', marginTop: '10px', lineHeight: 1.5 }}>
                This month is not over. Only trips that have already left are counted.
                {data.stillToDepart.net > 0 && ` ${formatPrice(data.stillToDepart.net)} more (after the platform's share) comes from trips that have not left yet.`}
              </div>
            )}
          </div>

          <div className="sheet-card" style={card}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <Row label="Owed to you at the start of the month" value={money(data.openingBalance)} />
                <Row label="Online ticket value" value={money(data.online.ticketValue)} note={`${data.online.tickets} ticket${data.online.tickets === 1 ? '' : 's'}, ${data.online.seats} seat${data.online.seats === 1 ? '' : 's'} travelled`} />
                <Row label="Refunded to passengers" value={money(-data.online.refunded)} note="Tickets cancelled with a partial refund. You keep the rest." />
                <Row label="Platform commission" value={money(-data.online.commission)} note="Each ticket keeps the rate it was sold at." />
                <Row label="Earned this month, after commission" value={money(data.online.net)} />
                <Row label="Paid to you this month" value={money(-data.payouts.total)} />
                <Row label={data.closingBalance < 0 ? 'Paid more than earned' : 'Owed to you at the end of the month'} value={money(data.closingBalance)} strong />
              </tbody>
            </table>
            {data.fullRefunds.tickets > 0 && (
              <p style={{ fontSize: '12px', color: '#999', marginTop: '10px', lineHeight: 1.5 }}>
                {data.fullRefunds.tickets} ticket{data.fullRefunds.tickets === 1 ? ' was' : 's were'} fully refunded ({formatPrice(data.fullRefunds.amount)}). No money was kept, so they are not in the figures above.
              </p>
            )}
          </div>

          <div className="sheet-card" style={card}>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '8px' }}>Trips</div>
            {data.trips.length === 0 ? <p style={{ fontSize: '13px', color: '#999' }}>No online tickets for trips that left this month.</p> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={th}>Date</th><th style={th}>Route</th><th style={{ ...th, ...num }}>Tickets</th><th style={{ ...th, ...num }}>Value</th>
                    <th style={{ ...th, ...num }}>Refunded</th><th style={{ ...th, ...num }}>Commission</th><th style={{ ...th, ...num }}>Net</th>
                  </tr></thead>
                  <tbody>
                    {data.trips.map((t) => (
                      <tr key={t.scheduleId}>
                        <td style={td}>{day(t.departureTime)}, {clock(t.departureTime)}</td>
                        <td style={td}>{t.route}</td>
                        <td style={{ ...td, ...num }}>{t.tickets}</td>
                        <td style={{ ...td, ...num }}>{formatPrice(t.ticketValue)}</td>
                        <td style={{ ...td, ...num }}>{t.refunded ? formatPrice(t.refunded) : '-'}</td>
                        <td style={{ ...td, ...num }}>{formatPrice(t.commission)}</td>
                        <td style={{ ...td, ...num, fontWeight: 600 }}>{formatPrice(t.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="sheet-card" style={card}>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '8px' }}>Payments to you</div>
            {data.payouts.items.length === 0 ? <p style={{ fontSize: '13px', color: '#999' }}>No payments this month.</p> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>Date</th><th style={th}>Method</th><th style={th}>Receipt number</th><th style={th}>Note</th><th style={{ ...th, ...num }}>Amount</th></tr></thead>
                  <tbody>
                    {data.payouts.items.map((p) => (
                      <tr key={p.id}>
                        <td style={td}>{day(p.paidAt)}</td><td style={td}>{PAYOUT_METHOD_LABEL[p.method]}</td>
                        <td style={td}>{p.reference ?? '-'}</td><td style={{ ...td, whiteSpace: 'normal' }}>{p.note ?? ''}</td>
                        <td style={{ ...td, ...num }}>{formatPrice(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.payouts.voided.length > 0 && (
              <p style={{ fontSize: '12px', color: '#999', marginTop: '10px', lineHeight: 1.6 }}>
                Cancelled entries, not counted: {data.payouts.voided.map((p) => `${formatPrice(p.amount)} on ${day(p.paidAt)}${p.reason ? ` (${p.reason})` : ''}`).join('; ')}.
              </p>
            )}
          </div>

          <div className="sheet-card" style={card}>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>Counter sales (for your information)</div>
            <p style={{ fontSize: '12px', color: '#999', margin: '0 0 8px', lineHeight: 1.5 }}>You take this money at the counter, so it is not part of the balance above.</p>
            {data.counter.tickets === 0 && data.counter.voided.tickets === 0 ? <p style={{ fontSize: '13px', color: '#999' }}>No counter sales for trips that left this month.</p> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>Payment</th><th style={{ ...th, ...num }}>Tickets</th><th style={{ ...th, ...num }}>Seats</th><th style={{ ...th, ...num }}>Total</th></tr></thead>
                  <tbody>
                    {data.counter.byMethod.map((m) => (
                      <tr key={m.method}><td style={td}>{PAYOUT_METHOD_LABEL[m.method as PayoutMethod] ?? m.method}</td><td style={{ ...td, ...num }}>{m.tickets}</td><td style={{ ...td, ...num }}>{m.seats}</td><td style={{ ...td, ...num }}>{formatPrice(m.total)}</td></tr>
                    ))}
                    <tr><td style={{ ...td, fontWeight: 700 }}>All counter sales</td><td style={{ ...td, ...num, fontWeight: 700 }}>{data.counter.tickets}</td><td style={{ ...td, ...num, fontWeight: 700 }}>{data.counter.seats}</td><td style={{ ...td, ...num, fontWeight: 700 }}>{formatPrice(data.counter.total)}</td></tr>
                  </tbody>
                </table>
              </div>
            )}
            {data.counter.voided.tickets > 0 && <p style={{ fontSize: '12px', color: '#999', marginTop: '8px' }}>{data.counter.voided.tickets} counter ticket{data.counter.voided.tickets === 1 ? '' : 's'} cancelled ({formatPrice(data.counter.voided.total)}), not counted.</p>}
          </div>

          <p style={{ fontSize: '11px', color: '#AAA', lineHeight: 1.6, margin: 0 }}>
            This statement is calculated when you open it and is not locked. If a payment is cancelled later, an old month changes. Compare the generated time above with any copy you keep.
          </p>
        </div>
      )}

      <div className="no-print" style={{ ...card, marginTop: '24px' }}>
        <div style={{ fontSize: '14px', fontWeight: 700 }}>Export every ticket sold</div>
        <p style={{ fontSize: '12px', color: '#999', margin: '4px 0 12px', lineHeight: 1.5 }}>
          One line for each ticket sold on the days you choose (the sale date, Addis time), online and at the counter, for your own accounts. It has no passenger names or phone numbers. Up to 366 days at a time.
        </p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ fontSize: '12px', color: '#666' }}>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={input} /></label>
          <label style={{ fontSize: '12px', color: '#666' }}>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={input} /></label>
          <button style={button} disabled={busy || !from || !to} onClick={() => run('/operator/exports/sales.csv', { from, to })}><Download size={15} /> Download (CSV)</button>
        </div>
      </div>
    </div>
  )
}
