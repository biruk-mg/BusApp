'use client'

import { useEffect, useRef, useState } from 'react'
import { api, assetUrl } from '@/lib/api'
import { prepareBannerImage } from '@/lib/imageUpload'
import { Megaphone, Plus, Pencil, Trash2, X, ImageIcon } from 'lucide-react'
import toast from 'react-hot-toast'
import { BannerSlide } from '@/components/OffersBanner'

interface Banner {
  id: string
  title: string
  message: string
  badge: string | null
  linkText: string | null
  linkUrl: string | null
  theme: string
  altText: string | null
  hasImage: boolean
  hasMobileImage: boolean
  imageVersion: number
  active: boolean
  sortOrder: number
  startsAt: string | null
  endsAt: string | null
}

const imageSrc = (b: Pick<Banner, 'id' | 'imageVersion'>, slot: 'desktop' | 'mobile') =>
  `/api/v1/public/banners/${b.id}/image?${slot === 'mobile' ? 'slot=mobile&' : ''}v=${b.imageVersion}`

interface FormState {
  altText: string
  title: string; message: string; badge: string; theme: string
  linkText: string; linkUrl: string
  startDate: string; endDate: string
  sortOrder: string; active: boolean
}

const EMPTY: FormState = {
  altText: '',
  title: '', message: '', badge: '', theme: 'red', linkText: '', linkUrl: '',
  startDate: '', endDate: '', sortOrder: '0', active: true,
}

// Dates are chosen as Addis Ababa days (UTC+3)
const ADDIS_OFFSET_MS = 3 * 3600 * 1000
const toAddisDate = (iso: string | null) =>
  iso ? new Date(new Date(iso).getTime() + ADDIS_OFFSET_MS).toISOString().slice(0, 10) : ''
const startIso = (d: string) => (d ? new Date(`${d}T00:00:00+03:00`).toISOString() : null)
const endIso = (d: string) => (d ? new Date(`${d}T23:59:59+03:00`).toISOString() : null)

function statusOf(b: Banner): { label: string; bg: string; color: string } {
  const now = Date.now()
  if (!b.active) return { label: 'Off', bg: '#F3F3F3', color: '#777' }
  if (b.startsAt && new Date(b.startsAt).getTime() > now) return { label: 'Scheduled', bg: '#EEF4FF', color: '#2F5DC4' }
  if (b.endsAt && new Date(b.endsAt).getTime() < now) return { label: 'Ended', bg: '#FFF5F5', color: '#C0392B' }
  return { label: 'Live', bg: '#EAF7EF', color: '#1E7A46' }
}

const input = { width: '100%', border: '1px solid #E0E0E0', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', background: '#fff', boxSizing: 'border-box' } as const
const label = { display: 'block', fontSize: '11px', color: '#999', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' } as const

export default function AdminBannersPage() {
  const [banners, setBanners] = useState<Banner[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  // Pictures chosen in the form but not saved yet, and removals waiting for Save
  const [desktopFile, setDesktopFile] = useState<File | null>(null)
  const [mobileFile, setMobileFile] = useState<File | null>(null)
  const [removeDesktop, setRemoveDesktop] = useState(false)
  const [removeMobile, setRemoveMobile] = useState(false)
  const [desktopPreview, setDesktopPreview] = useState<string | null>(null)
  const [mobilePreview, setMobilePreview] = useState<string | null>(null)
  const desktopInput = useRef<HTMLInputElement>(null)
  const mobileInput = useRef<HTMLInputElement>(null)

  const load = async () => {
    try {
      const res = await api.get('/admin/banners')
      setBanners(res.data.data.banners)
    } catch { toast.error('Failed to load offers') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const errorOf = (err: unknown) => (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Something went wrong'

  const editing = editingId && editingId !== 'new' ? banners.find((b) => b.id === editingId) || null : null

  const resetPictures = () => {
    setDesktopFile(null); setMobileFile(null); setRemoveDesktop(false); setRemoveMobile(false)
    if (desktopInput.current) desktopInput.current.value = ''
    if (mobileInput.current) mobileInput.current.value = ''
  }

  // Show the chosen file straight away (and free the memory when it changes)
  useEffect(() => {
    if (!desktopFile) { setDesktopPreview(null); return }
    const url = URL.createObjectURL(desktopFile)
    setDesktopPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [desktopFile])
  useEffect(() => {
    if (!mobileFile) { setMobilePreview(null); return }
    const url = URL.createObjectURL(mobileFile)
    setMobilePreview(url)
    return () => URL.revokeObjectURL(url)
  }, [mobileFile])

  // What the form will have after Save
  const willHaveDesktop = !!desktopFile || (!!editing?.hasImage && !removeDesktop)
  const willHaveMobile = willHaveDesktop && (!!mobileFile || (!!editing?.hasMobileImage && !removeMobile && !removeDesktop))
  const desktopShown = desktopPreview || (editing?.hasImage && !removeDesktop ? imageSrc(editing, 'desktop') : null)
  const mobileShown = !willHaveDesktop ? null : mobilePreview || (editing?.hasMobileImage && !removeMobile && !removeDesktop ? imageSrc(editing, 'mobile') : null)

  const openNew = () => { resetPictures(); setForm(EMPTY); setEditingId('new') }
  const openEdit = (b: Banner) => {
    resetPictures()
    setForm({
      altText: b.altText || '',
      title: b.title, message: b.message, badge: b.badge || '', theme: b.theme,
      linkText: b.linkText || '', linkUrl: b.linkUrl || '',
      startDate: toAddisDate(b.startsAt), endDate: toAddisDate(b.endsAt),
      sortOrder: String(b.sortOrder), active: b.active,
    })
    setEditingId(b.id)
  }
  const closeForm = () => { setEditingId(null); setForm(EMPTY); resetPictures() }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const body = {
      title: form.title, message: form.message, badge: form.badge, theme: form.theme,
      altText: form.altText, linkText: form.linkText, linkUrl: form.linkUrl,
      startsAt: startIso(form.startDate), endsAt: endIso(form.endDate),
      sortOrder: Number(form.sortOrder) || 0, active: form.active,
    }
    let bannerId: string | null = null
    try {
      // 1. the text and settings
      if (editingId === 'new') {
        const res = await api.post('/admin/banners', body)
        bannerId = res.data.data.banner.id
      } else {
        await api.patch(`/admin/banners/${editingId}`, body)
        bannerId = editingId as string
      }
      // 2. the pictures (shrunk in the browser first if they are large)
      try {
        if (removeDesktop) {
          await api.delete(`/admin/banners/${bannerId}/image`)
        } else {
          if (desktopFile) {
            const blob = await prepareBannerImage(desktopFile, 1600)
            await api.put(`/admin/banners/${bannerId}/image`, blob, { headers: { 'Content-Type': blob.type } })
          }
          if (removeMobile) {
            await api.delete(`/admin/banners/${bannerId}/image?slot=mobile`)
          } else if (mobileFile) {
            const blob = await prepareBannerImage(mobileFile, 900)
            await api.put(`/admin/banners/${bannerId}/image?slot=mobile`, blob, { headers: { 'Content-Type': blob.type } })
          }
        }
      } catch (err) {
        // The offer itself is saved: keep the form open on it so the picture can be tried again
        const msg = err instanceof Error && !(err as { response?: unknown }).response ? err.message : errorOf(err)
        await load()
        resetPictures()
        setEditingId(bannerId)
        toast.error(`The offer was saved, but the picture was not: ${msg}`)
        return
      }
      toast.success('Saved')
      closeForm()
      load()
    } catch (err) { toast.error(errorOf(err)) }
    finally { setSaving(false) }
  }

  const toggleActive = async (b: Banner) => {
    try {
      await api.patch(`/admin/banners/${b.id}`, { active: !b.active })
      load()
    } catch (err) { toast.error(errorOf(err)) }
  }

  const handleDelete = async (b: Banner) => {
    if (!confirm(`Delete the offer "${b.title}"?`)) return
    try {
      await api.delete(`/admin/banners/${b.id}`)
      toast.success('Offer deleted')
      load()
    } catch (err) { toast.error(errorOf(err)) }
  }

  const set = (k: keyof FormState, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', gap: '12px', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Megaphone size={22} color="#C0392B" /> Offers
        </h1>
        <button onClick={openNew}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#C0392B', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={16} /> New offer
        </button>
      </div>
      <p style={{ fontSize: '13px', color: '#999', marginBottom: '24px', maxWidth: '620px', lineHeight: 1.6 }}>
        Offers appear in a sliding banner on the home page while they are switched on and inside their dates. With several live offers (up to 10), the page slides through them by itself in the order you set.
        You can type a text offer or upload a picture your designer made. These are announcements: they do not change any ticket price.
      </p>

      {editingId && (
        <form onSubmit={handleSave} style={{ background: 'white', borderRadius: '16px', border: '1px solid #F0F0F0', padding: '24px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700 }}>{editingId === 'new' ? 'New offer' : 'Edit offer'}</h2>
            <button type="button" onClick={closeForm} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999' }}><X size={18} /></button>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <div style={label}>Preview (what passengers see)</div>
            <BannerSlide banner={{
              title: form.title || 'Your offer title', message: form.message, badge: form.badge || null,
              linkText: form.linkText || null, linkUrl: form.linkUrl || null, theme: form.theme,
              altText: form.altText || null, imageUrl: desktopShown, mobileImageUrl: mobileShown,
            }} />
          </div>

          <div style={{ border: '1px dashed #E0C9C6', background: '#FFFAF9', borderRadius: '12px', padding: '16px', marginBottom: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: '#1a1a1a', marginBottom: '4px' }}>
              <ImageIcon size={16} color="#C0392B" /> Designed picture (optional)
            </div>
            <p style={{ fontSize: '12px', color: '#999', lineHeight: 1.6, marginBottom: '14px' }}>
              Upload the banner your designer made. With a picture, the picture is the whole banner and passengers can tap it to go to the link below
              (the text, badge, colour and button text are not shown). Big pictures are shrunk automatically.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
              <div>
                <label style={label}>Wide picture · 1600 × 600 px (JPG, PNG or WebP)</label>
                <input ref={desktopInput} type="file" accept="image/jpeg,image/png,image/webp" style={input}
                  onChange={(e) => { setDesktopFile(e.target.files?.[0] || null); setRemoveDesktop(false) }} />
                {editing?.hasImage && !removeDesktop && !desktopFile && (
                  <button type="button" onClick={() => setRemoveDesktop(true)}
                    style={{ marginTop: '8px', background: 'none', border: 'none', color: '#C0392B', fontSize: '12px', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                    Remove the current picture (on Save)
                  </button>
                )}
                {removeDesktop && <div style={{ marginTop: '8px', fontSize: '12px', color: '#C0392B' }}>The picture will be removed when you save.</div>}
              </div>
              <div>
                <label style={label}>Phone picture · 800 × 800 px (optional)</label>
                <input ref={mobileInput} type="file" accept="image/jpeg,image/png,image/webp" style={{ ...input, opacity: willHaveDesktop ? 1 : 0.5 }}
                  disabled={!willHaveDesktop}
                  onChange={(e) => { setMobileFile(e.target.files?.[0] || null); setRemoveMobile(false) }} />
                {!willHaveDesktop && <div style={{ marginTop: '6px', fontSize: '12px', color: '#999' }}>Choose the wide picture first.</div>}
                {editing?.hasMobileImage && !removeMobile && !mobileFile && willHaveDesktop && (
                  <button type="button" onClick={() => setRemoveMobile(true)}
                    style={{ marginTop: '8px', background: 'none', border: 'none', color: '#C0392B', fontSize: '12px', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                    Remove the current phone picture (on Save)
                  </button>
                )}
                {mobileShown && (
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ fontSize: '11px', color: '#999', marginBottom: '4px' }}>Phone version</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={assetUrl(mobileShown)} alt="Phone version" style={{ width: '120px', height: '120px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #EEE' }} />
                  </div>
                )}
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={label}>Picture description (for people who cannot see it)</label>
                <input style={input} value={form.altText} maxLength={200} onChange={(e) => set('altText', e.target.value)} placeholder="10% off Addis Ababa to Hawassa this weekend" />
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
            <div>
              <label style={label}>Title * (your own name for the offer)</label>
              <input style={input} value={form.title} maxLength={80} required onChange={(e) => set('title', e.target.value)} placeholder="10% off Addis Ababa to Hawassa" />
            </div>
            <div>
              <label style={label}>Small badge (optional)</label>
              <input style={input} value={form.badge} maxLength={24} onChange={(e) => set('badge', e.target.value)} placeholder="NEW OFFER" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={label}>Message (optional)</label>
              <textarea style={{ ...input, minHeight: '70px', resize: 'vertical', fontFamily: 'inherit' }} value={form.message} maxLength={240}
                onChange={(e) => set('message', e.target.value)} placeholder="Tell passengers what the offer is and who it is for." />
            </div>
            <div>
              <label style={label}>Button text (optional)</label>
              <input style={input} value={form.linkText} maxLength={30} onChange={(e) => set('linkText', e.target.value)} placeholder="Book now" />
            </div>
            <div>
              <label style={label}>Button link (optional)</label>
              <input style={input} value={form.linkUrl} maxLength={300} onChange={(e) => set('linkUrl', e.target.value)} placeholder="/search  or  https://..." />
            </div>
            <div>
              <label style={label}>Colour</label>
              <select style={input} value={form.theme} onChange={(e) => set('theme', e.target.value)}>
                <option value="red">Red</option>
                <option value="gold">Gold</option>
                <option value="green">Green</option>
              </select>
            </div>
            <div>
              <label style={label}>Order (smaller shows first)</label>
              <input style={input} type="number" min={0} max={999} value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />
            </div>
            <div>
              <label style={label}>First day shown (optional)</label>
              <input style={input} type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
            </div>
            <div>
              <label style={label}>Last day shown (optional)</label>
              <input style={input} type="date" value={form.endDate} min={form.startDate || undefined} onChange={(e) => set('endDate', e.target.value)} />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#444', margin: '18px 0' }}>
            <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
            Switched on (shown on the home page when inside its dates)
          </label>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="submit" disabled={saving}
              style={{ background: '#C0392B', color: 'white', border: 'none', padding: '10px 24px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save offer'}
            </button>
            <button type="button" onClick={closeForm}
              style={{ background: 'white', color: '#666', border: '1px solid #E0E0E0', padding: '10px 20px', borderRadius: '10px', fontSize: '13px', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div style={{ color: '#999', fontSize: '14px' }}>Loading…</div>
      ) : banners.length === 0 ? (
        <div style={{ background: 'white', border: '1px dashed #E0E0E0', borderRadius: '16px', padding: '40px 20px', textAlign: 'center', color: '#999', fontSize: '14px' }}>
          No offers yet. Add one and it will appear on the home page.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {banners.map((b) => {
            const st = statusOf(b)
            return (
              <div key={b.id} style={{ background: 'white', border: '1px solid #F0F0F0', borderRadius: '16px', padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: '1 1 260px' }}>
                    {b.hasImage && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={assetUrl(imageSrc(b, 'desktop'))} alt={b.altText || b.title}
                        style={{ width: '100%', maxWidth: '320px', aspectRatio: '8 / 3', objectFit: 'cover', borderRadius: '10px', border: '1px solid #EEE', marginBottom: '8px', display: 'block' }} />
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <span style={{ background: st.bg, color: st.color, fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px' }}>{st.label}</span>
                      <span style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a' }}>{b.title}</span>
                    </div>
                    {b.message && <div style={{ fontSize: '13px', color: '#777', lineHeight: 1.5 }}>{b.message}</div>}
                    <div style={{ fontSize: '12px', color: '#AAA', marginTop: '6px' }}>
                      Order {b.sortOrder} · {b.startsAt ? `from ${toAddisDate(b.startsAt)}` : 'no start date'} · {b.endsAt ? `until ${toAddisDate(b.endsAt)}` : 'no end date'}
                      {b.linkUrl ? ` · links to ${b.linkUrl}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button onClick={() => toggleActive(b)}
                      style={{ background: 'white', border: '1px solid #E0E0E0', borderRadius: '8px', padding: '7px 12px', fontSize: '12px', color: '#555', cursor: 'pointer' }}>
                      {b.active ? 'Switch off' : 'Switch on'}
                    </button>
                    <button onClick={() => openEdit(b)} aria-label="Edit"
                      style={{ background: 'white', border: '1px solid #E0E0E0', borderRadius: '8px', padding: '7px 10px', cursor: 'pointer', color: '#555', display: 'flex' }}>
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleDelete(b)} aria-label="Delete"
                      style={{ background: 'white', border: '1px solid #F3C9C5', borderRadius: '8px', padding: '7px 10px', cursor: 'pointer', color: '#C0392B', display: 'flex' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
