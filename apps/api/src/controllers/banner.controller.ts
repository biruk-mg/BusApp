import { Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'

// A link may only go to a page of this site ("/search") or to an https address.
// This blocks "javascript:" and other tricks, because the admin screen is the
// only place links come from but the home page is seen by everyone.
const linkUrl = z
  .string()
  .trim()
  .max(300)
  .refine(
    (v) => v === '' || (v.startsWith('/') && !v.startsWith('//')) || /^https:\/\/[^\s]+$/.test(v),
    'The link must start with / (a page of this site) or https://',
  )

const bannerFields = z.object({
  altText: z.string().trim().max(200, 'Image description is too long (200 letters max)'),
  title: z.string().trim().min(1, 'Title is required').max(80, 'Title is too long (80 letters max)'),
  message: z.string().trim().max(240, 'Message is too long (240 letters max)'),
  badge: z.string().trim().max(24, 'Badge is too long (24 letters max)'),
  linkText: z.string().trim().max(30, 'Button text is too long (30 letters max)'),
  linkUrl,
  theme: z.enum(['red', 'gold', 'green']),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(999),
  startsAt: z.string().datetime().nullable(),
  endsAt: z.string().datetime().nullable(),
})

const createSchema = bannerFields.partial().required({ title: true })
const updateSchema = bannerFields.partial()

const blankToNull = (v: string | undefined) => (v === undefined ? undefined : v === '' ? null : v)

function toData(d: z.infer<typeof updateSchema>) {
  return {
    ...(d.title !== undefined ? { title: d.title } : {}),
    ...(d.message !== undefined ? { message: d.message } : {}),
    ...(d.badge !== undefined ? { badge: blankToNull(d.badge) } : {}),
    ...(d.linkText !== undefined ? { linkText: blankToNull(d.linkText) } : {}),
    ...(d.linkUrl !== undefined ? { linkUrl: blankToNull(d.linkUrl) } : {}),
    ...(d.altText !== undefined ? { altText: blankToNull(d.altText) } : {}),
    ...(d.theme !== undefined ? { theme: d.theme } : {}),
    ...(d.active !== undefined ? { active: d.active } : {}),
    ...(d.sortOrder !== undefined ? { sortOrder: d.sortOrder } : {}),
    ...(d.startsAt !== undefined ? { startsAt: d.startsAt ? new Date(d.startsAt) : null } : {}),
    ...(d.endsAt !== undefined ? { endsAt: d.endsAt ? new Date(d.endsAt) : null } : {}),
  }
}

// The image bytes are never sent in admin lists: only whether each image exists
const NO_BYTES = { imageData: true, mobileImageData: true } as const
const flagged = <T extends { imageMime: string | null; mobileImageMime: string | null }>(b: T) => {
  const { imageMime, mobileImageMime, ...rest } = b
  return { ...rest, hasImage: !!imageMime, hasMobileImage: !!mobileImageMime }
}

const datesOk = (startsAt: Date | null | undefined, endsAt: Date | null | undefined) =>
  !startsAt || !endsAt || endsAt > startsAt

export const listBanners = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const banners = await prisma.banner.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      omit: NO_BYTES,
    })
    res.json({ success: true, data: { banners: banners.map(flagged) } })
  } catch (error) {
    console.error('ListBanners error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

export const createBanner = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0].message })
      return
    }
    const data = toData(parsed.data)
    if (!datesOk(data.startsAt, data.endsAt)) {
      res.status(400).json({ success: false, error: 'The end date must be after the start date' })
      return
    }
    const banner = await prisma.banner.create({
      data: { title: parsed.data.title, ...data },
      omit: NO_BYTES,
    })
    res.status(201).json({ success: true, message: 'Banner created', data: { banner: flagged(banner) } })
  } catch (error) {
    console.error('CreateBanner error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

export const updateBanner = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string
    const parsed = updateSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0].message })
      return
    }
    const existing = await prisma.banner.findUnique({ where: { id }, omit: NO_BYTES })
    if (!existing) {
      res.status(404).json({ success: false, error: 'Banner not found' })
      return
    }
    const data = toData(parsed.data)
    const startsAt = data.startsAt !== undefined ? data.startsAt : existing.startsAt
    const endsAt = data.endsAt !== undefined ? data.endsAt : existing.endsAt
    if (!datesOk(startsAt, endsAt)) {
      res.status(400).json({ success: false, error: 'The end date must be after the start date' })
      return
    }
    const banner = await prisma.banner.update({ where: { id }, data, omit: NO_BYTES })
    res.json({ success: true, message: 'Banner updated', data: { banner: flagged(banner) } })
  } catch (error) {
    console.error('UpdateBanner error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

export const deleteBanner = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string
    const existing = await prisma.banner.findUnique({ where: { id } })
    if (!existing) {
      res.status(404).json({ success: false, error: 'Banner not found' })
      return
    }
    await prisma.banner.delete({ where: { id } })
    res.json({ success: true, message: 'Banner deleted' })
  } catch (error) {
    console.error('DeleteBanner error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── Banner images ───────────────────────────────────────
// The browser sends the picture as the raw request body (not JSON). Only real
// JPEG, PNG and WebP files are accepted: the file's own first bytes decide what
// it is, not the name or the header the browser claims. SVG and GIF are refused.
export const MAX_IMAGE_BYTES = 1024 * 1024

export function detectImage(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  return null
}

const slotOf = (q: unknown): 'desktop' | 'mobile' | null =>
  q === undefined || q === 'desktop' ? 'desktop' : q === 'mobile' ? 'mobile' : null

export const setBannerImage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string
    const slot = slotOf(req.query.slot)
    if (!slot) {
      res.status(400).json({ success: false, error: 'slot must be desktop or mobile' })
      return
    }
    const body: unknown = req.body
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(415).json({ success: false, error: 'Send the image as a JPEG, PNG or WebP file' })
      return
    }
    const mime = detectImage(body)
    if (!mime) {
      res.status(400).json({ success: false, error: 'That file is not a valid JPEG, PNG or WebP image' })
      return
    }
    if (String(req.headers['content-type'] || '').split(';')[0].trim() !== mime) {
      res.status(400).json({ success: false, error: 'The file type does not match its contents' })
      return
    }
    const existing = await prisma.banner.findUnique({ where: { id }, select: { id: true, imageMime: true } })
    if (!existing) {
      res.status(404).json({ success: false, error: 'Banner not found' })
      return
    }
    if (slot === 'mobile' && !existing.imageMime) {
      res.status(400).json({ success: false, error: 'Upload the main (wide) image first' })
      return
    }
    const bytes = new Uint8Array(body)
    const banner = await prisma.banner.update({
      where: { id },
      data: slot === 'desktop'
        ? { imageData: bytes, imageMime: mime, imageVersion: { increment: 1 } }
        : { mobileImageData: bytes, mobileImageMime: mime, imageVersion: { increment: 1 } },
      omit: NO_BYTES,
    })
    res.json({ success: true, message: 'Image saved', data: { banner: flagged(banner) } })
  } catch (error) {
    console.error('SetBannerImage error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

export const deleteBannerImage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string
    const slot = slotOf(req.query.slot)
    if (!slot) {
      res.status(400).json({ success: false, error: 'slot must be desktop or mobile' })
      return
    }
    const existing = await prisma.banner.findUnique({ where: { id }, select: { id: true } })
    if (!existing) {
      res.status(404).json({ success: false, error: 'Banner not found' })
      return
    }
    // The phone image only makes sense next to the wide one, so removing the
    // wide image removes both.
    const clear = slot === 'desktop'
      ? { imageData: null, imageMime: null, mobileImageData: null, mobileImageMime: null }
      : { mobileImageData: null, mobileImageMime: null }
    const banner = await prisma.banner.update({
      where: { id },
      data: { ...clear, imageVersion: { increment: 1 } },
      omit: NO_BYTES,
    })
    res.json({ success: true, message: 'Image removed', data: { banner: flagged(banner) } })
  } catch (error) {
    console.error('DeleteBannerImage error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}
