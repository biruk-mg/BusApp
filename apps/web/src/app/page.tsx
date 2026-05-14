'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { ArrowRight, Shield, Clock, Ticket, CheckCircle, MapPin, Star } from 'lucide-react'

const CITIES = [
  'Addis Ababa', 'Adama', 'Hawassa', 'Bahir Dar',
  'Dire Dawa', 'Jimma', 'Mekelle', 'Gondar'
]

const ROUTES = [
  {
    from: 'Addis Ababa', to: 'Adama',
    price: 150, rating: 4.9, duration: '1h 30m',
    desc: 'Quick ride to the heart of Adama city',
    img: 'https://z-p3-scontent.fadd1-1.fna.fbcdn.net/v/t39.30808-6/485157512_1064540085720172_160269598318649153_n.jpg?_nc_cat=102&ccb=1-7&_nc_sid=833d8c&_nc_eui2=AeF5xasKgNLkOEg0iVopwzTzk8Q3dPFLfYmTxDd08Ut9iTVwkUq8ZRYmNL5E8sMxEmO-kcXsyeqIc3BC6RDoYHtH&_nc_ohc=haIqUsZxu3kQ7kNvwFnhTDl&_nc_oc=AdrsDgI9Buzy2c6FzPrNks5mkXPLJWWYPk6Y_3KehG76E4WD-Pxbg173lWxx2E66gAE&_nc_zt=23&_nc_ht=z-p3-scontent.fadd1-1.fna&_nc_gid=NjFt95N1790Opcko2wZ5KQ&_nc_ss=7b2a8&oh=00_Af7JGnOLg7i0lzsNsGLis7kIWmG1k3xBDvmC3IQXkkTULw&oe=6A0B5195'
  },
  {
    from: 'Addis Ababa', to: 'Hawassa',
    price: 350, rating: 4.8, duration: '4h 30m',
    desc: 'Scenic route to the beautiful lakeside city',
    img: 'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=400&q=80'
  },
  {
    from: 'Addis Ababa', to: 'Bahir Dar',
    price: 550, rating: 4.9, duration: '8h',
    desc: 'Gateway to Lake Tana and Blue Nile Falls',
    img: 'https://images.unsplash.com/photo-1489749798305-4fea3ae63d43?w=400&q=80'
  },
  {
    from: 'Addis Ababa', to: 'Jimma',
    price: 400, rating: 4.7, duration: '6h',
    desc: 'Journey to the coffee capital of the world',
    img: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=400&q=80'
  },
]

const TESTIMONIALS = [
  {
    text: 'Booking was so easy! I got my e-ticket in seconds and the bus was exactly on time. Will definitely use EthioBus again.',
    route: 'Addis Ababa → Hawassa',
    name: 'Sara Tesfaye',
    location: 'Addis Ababa',
    initials: 'ST',
    color: '#C0392B'
  },
  {
    text: 'Finally a bus booking app that works! Paid with Telebirr, selected my seat, and got the QR code instantly. Amazing.',
    route: 'Addis Ababa → Bahir Dar',
    name: 'Biruk Mulugeta',
    location: 'Addis Ababa',
    initials: 'BM',
    color: '#2E8B57'
  },
  {
    text: 'The seat selection feature is brilliant. I could see exactly which seats were available and pick the best one for my trip.',
    route: 'Addis Ababa → Jimma',
    name: 'Hana Alemu',
    location: 'Jimma',
    initials: 'HA',
    color: '#8B008B'
  },
]

export default function HomePage() {
  const router = useRouter()
  const [fromCity, setFromCity] = useState('')
  const [toCity, setToCity] = useState('')
  const [date, setDate] = useState('')
  const [passengers, setPassengers] = useState(1)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  if (!mounted) return null

  const today = new Date().toISOString().split('T')[0]

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!fromCity || !toCity || !date) return
    router.push(`/search?fromCity=${encodeURIComponent(fromCity)}&toCity=${encodeURIComponent(toCity)}&date=${date}&passengers=${passengers}`)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      <Navbar />

      {/* Hero */}
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px', padding: '64px 80px 48px', alignItems: 'center', maxWidth: '1200px', margin: '0 auto' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#FEF9E7', border: '1px solid #F0D060', borderRadius: '20px', padding: '6px 14px', marginBottom: '20px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#C0392B' }} />
            <span style={{ fontSize: '12px', color: '#C0392B', fontWeight: 500 }}>Ethiopia's #1 Bus Booking Platform</span>
          </div>

          <h1 style={{ fontSize: '48px', fontWeight: 700, lineHeight: 1.15, color: '#1a1a1a', marginBottom: '16px' }}>
            Travel Across<br />
            Ethiopia with{' '}
            <span style={{ color: '#C0392B' }}>Ease</span>
          </h1>

          <p style={{ fontSize: '16px', color: '#666', lineHeight: 1.7, marginBottom: '32px', maxWidth: '420px' }}>
            Book bus tickets to any major Ethiopian city online — secure payments, instant e-tickets, and real-time seat selection.
          </p>

          {/* Search Box */}
          <form onSubmit={handleSearch}>
            <div style={{ background: '#F8F8F8', border: '1px solid #E5E5E5', borderRadius: '16px', padding: '20px', marginBottom: '32px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#999', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>From</label>
                  <select
                    value={fromCity}
                    onChange={(e) => setFromCity(e.target.value)}
                    required
                    style={{ width: '100%', border: '1px solid #E0E0E0', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', background: '#fff' }}
                  >
                    <option value="">Select city</option>
                    {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#999', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>To</label>
                  <select
                    value={toCity}
                    onChange={(e) => setToCity(e.target.value)}
                    required
                    style={{ width: '100%', border: '1px solid #E0E0E0', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', background: '#fff' }}
                  >
                    <option value="">Select city</option>
                    {CITIES.filter(c => c !== fromCity).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#999', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date</label>
                  <input
                    type="date"
                    value={date}
                    min={today}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    style={{ width: '100%', border: '1px solid #E0E0E0', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', background: '#fff' }}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'end' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#999', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Passengers</label>
                  <select
                    value={passengers}
                    onChange={(e) => setPassengers(Number(e.target.value))}
                    style={{ width: '100%', border: '1px solid #E0E0E0', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', background: '#fff' }}
                  >
                    {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} Passenger{n > 1 ? 's' : ''}</option>)}
                  </select>
                </div>
                <button
                  type="submit"
                  style={{ background: '#C0392B', color: 'white', border: 'none', borderRadius: '8px', padding: '11px 28px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
                >
                  Search <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </form>

          {/* Stats */}
          <div style={{ display: 'flex', gap: '40px' }}>
            {[
              { num: '9+', label: 'Routes' },
              { num: '500+', label: 'Happy travelers' },
              { num: '4.9', label: 'Rating' },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a' }}>{s.num}</div>
                <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

      {/* Hero Images */}
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '200px 200px', gap: '12px' }}>
  {/* Addis Ababa — tall */}
  <div style={{ gridRow: 'span 2', borderRadius: '16px', overflow: 'hidden', position: 'relative' }}>
    <img
      src="https://images.unsplash.com/photo-1734865934450-719ef6f59a37?q=80&w=735&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
      alt="Addis Ababa"
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
    />
    <div style={{ position: 'absolute', bottom: '12px', left: '12px', background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px' }}>
      Addis Ababa
    </div>
  </div>

  {/* Hawassa */}
  <div style={{ borderRadius: '16px', overflow: 'hidden', position: 'relative' }}>
    <img
      src="https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=400&q=80"
      alt="Hawassa"
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
    />
    <div style={{ position: 'absolute', bottom: '8px', left: '10px', background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px' }}>
      Hawassa
    </div>
  </div>

  {/* Bahir Dar */}
  <div style={{ borderRadius: '16px', overflow: 'hidden', position: 'relative' }}>
    <img
      src="https://z-p3-scontent.fadd1-1.fna.fbcdn.net/v/t39.30808-6/557319388_1312475937557059_6825128574076986818_n.jpg?stp=dst-jpg_s590x590_tt6&_nc_cat=103&ccb=1-7&_nc_sid=833d8c&_nc_eui2=AeGcx5hYXuSTmd_TIWCf0VuKc8JtqdPfoV9zwm2p09-hXyqf6HCZw7K24edUw0JRogD8jFsLqHmGMNvdO09XsISH&_nc_ohc=pmsQBsf_1m8Q7kNvwHy-_Ez&_nc_oc=AdrMD5ydQJ5oXgJ0TmCEdUS0yLua1MxfqLKBbB2nmk_I_x-A_o997haM9za-4j8czxk&_nc_zt=23&_nc_ht=z-p3-scontent.fadd1-1.fna&_nc_gid=4-c1syvkNHdKGc9dlPyobw&_nc_ss=7b2a8&oh=00_Af6A3OCbLiUffZ3TqMuKQfj_KW8Zwijd1Psg2rf70QG-zA&oe=6A0B2B9B"
      alt="Bahir Dar"
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
    />
    <div style={{ position: 'absolute', bottom: '8px', left: '10px', background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px' }}>
      Bahir Dar
    </div>
  </div>
</div>
      </section>

      {/* Popular Routes */}
      <section style={{ padding: '64px 80px', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '32px' }}>
          <div>
            <div style={{ fontSize: '12px', color: '#C0392B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Explore</div>
            <h2 style={{ fontSize: '32px', fontWeight: 700, color: '#1a1a1a' }}>Popular <span style={{ color: '#C0392B' }}>Routes</span></h2>
          </div>
          <Link href="/search" style={{ fontSize: '13px', color: '#666', border: '1px solid #E0E0E0', padding: '8px 18px', borderRadius: '8px', textDecoration: 'none' }}>
            View All Routes
          </Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          {ROUTES.map((route) => (
            <div
              key={route.to}
              onClick={() => router.push(`/search?fromCity=${encodeURIComponent(route.from)}&toCity=${encodeURIComponent(route.to)}&date=${today}&passengers=1`)}
              style={{ border: '1px solid #E5E5E5', borderRadius: '16px', overflow: 'hidden', cursor: 'pointer', transition: 'transform 0.2s', background: '#fff' }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-4px)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
            >
              <div style={{ height: '140px', position: 'relative', overflow: 'hidden' }}>
                <img
                  src={route.img}
                  alt={route.to}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <div style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(255,255,255,0.95)', fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <Star size={10} style={{ fill: '#F59E0B', color: '#F59E0B' }} />
                  {route.rating}
                </div>
              </div>
              <div style={{ padding: '14px' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#1a1a1a', marginBottom: '4px' }}>{route.from} → {route.to}</div>
                <div style={{ fontSize: '12px', color: '#999', marginBottom: '12px', lineHeight: 1.5 }}>{route.desc}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#C0392B' }}>
                    ETB {route.price} <span style={{ fontSize: '11px', color: '#999', fontWeight: 400 }}>/ seat</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#999' }}>{route.duration}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Why Choose Us */}
      <section style={{ background: '#F8F8F8', padding: '64px 80px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <div style={{ fontSize: '12px', color: '#C0392B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Why choose us</div>
            <h2 style={{ fontSize: '32px', fontWeight: 700, color: '#1a1a1a' }}>Travel with <span style={{ color: '#C0392B' }}>Confidence</span></h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
            {[
              { icon: <CheckCircle size={22} />, title: 'Verified Operators', desc: 'All bus operators are licensed and verified for your safety and comfort' },
              { icon: <Shield size={22} />, title: 'Secure Payments', desc: 'Pay with Telebirr, CBE Birr, or card — fully encrypted and secure' },
              { icon: <Clock size={22} />, title: '24/7 Support', desc: 'Round-the-clock assistance wherever you are in Ethiopia' },
              { icon: <Ticket size={22} />, title: 'Instant E-Ticket', desc: 'Get your QR code ticket instantly after booking — no printing needed' },
            ].map(item => (
              <div key={item.title} style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: '16px', padding: '28px 20px', textAlign: 'center' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#C0392B' }}>
                  {item.icon}
                </div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a', marginBottom: '8px' }}>{item.title}</div>
                <div style={{ fontSize: '13px', color: '#999', lineHeight: 1.6 }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section style={{ padding: '64px 80px', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ fontSize: '12px', color: '#C0392B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Testimonials</div>
          <h2 style={{ fontSize: '32px', fontWeight: 700, color: '#1a1a1a' }}>What Travelers <span style={{ color: '#C0392B' }}>Say</span></h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
          {TESTIMONIALS.map((t) => (
            <div key={t.name} style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: '16px', padding: '24px' }}>
              <div style={{ color: '#F59E0B', fontSize: '16px', marginBottom: '12px' }}>★★★★★</div>
              <p style={{ fontSize: '14px', color: '#555', lineHeight: 1.7, marginBottom: '16px', fontStyle: 'italic' }}>"{t.text}"</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#C0392B', marginBottom: '14px' }}>
                <MapPin size={12} />{t.route}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: t.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 600, color: 'white' }}>{t.initials}</div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>{t.name}</div>
                  <div style={{ fontSize: '11px', color: '#999' }}>{t.location}, Ethiopia</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: '#1A0A0A', padding: '80px', textAlign: 'center' }}>
        <h2 style={{ fontSize: '40px', fontWeight: 700, color: 'white', marginBottom: '16px', lineHeight: 1.3 }}>
          Ready for Your Next<br />
          <span style={{ color: '#D4A017' }}>Ethiopian Journey?</span>
        </h2>
        <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.5)', marginBottom: '36px' }}>
          Start booking today. Travel comfortably across Ethiopia.
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginBottom: '36px' }}>
          <button
            onClick={() => router.push('/search')}
            style={{ background: '#C0392B', color: 'white', border: 'none', padding: '14px 32px', borderRadius: '10px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            Book a Trip <ArrowRight size={16} />
          </button>
          <Link href="/search" style={{ background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.3)', padding: '14px 32px', borderRadius: '10px', fontSize: '15px', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
            View All Routes
          </Link>
        </div>
        <div style={{ display: 'flex', gap: '32px', justifyContent: 'center' }}>
          {['Secure booking', 'Best price guarantee', '500+ happy travelers'].map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
              <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#D4A017' }} />
              {t}
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer style={{ background: '#0D0505', padding: '48px 80px 24px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', gap: '40px', marginBottom: '40px' }}>
            <div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'white', marginBottom: '12px' }}>
                Ethio<span style={{ color: '#C0392B' }}>Bus</span>
              </div>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.35)', lineHeight: 1.7, maxWidth: '220px' }}>
                Ethiopia's most trusted online bus booking platform. Travel comfortably anywhere.
              </p>
            </div>
            {[
              { title: 'Routes', links: ['Addis → Adama', 'Addis → Hawassa', 'Addis → Bahir Dar', 'Addis → Jimma'] },
              { title: 'Company', links: ['About Us', 'Careers', 'Press', 'Blog'] },
              { title: 'Support', links: ['Help Center', 'Contact', 'FAQ', 'Refund Policy'] },
            ].map(col => (
              <div key={col.title}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'white', marginBottom: '16px' }}>{col.title}</div>
                {col.links.map(l => (
                  <div key={l} style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', marginBottom: '10px' }}>{l}</div>
                ))}
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.25)' }}>© 2026 EthioBus. All rights reserved.</div>
            <div style={{ display: 'flex', gap: '20px' }}>
              {['Privacy Policy', 'Terms of Service'].map(l => (
                <span key={l} style={{ fontSize: '12px', color: 'rgba(255,255,255,0.25)' }}>{l}</span>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}