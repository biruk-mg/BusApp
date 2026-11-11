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
    ...(d.theme !== undefined ? { theme: d.theme } : {}),
    ...(d.active !== undefined ? { active: d.active } : {}),
    ...(d.sortOrder !== undefined ? { sortOrder: d.sortOrder } : {}),
    ...(d.startsAt !== undefined ? { startsAt: d.startsAt ? new Date(d.startsAt) : null } : {}),
    ...(d.endsAt !== undefined ? { endsAt: d.endsAt ? new Date(d.endsAt) : null } : {}),
  }
}

const datesOk = (startsAt: Date | null | undefined, endsAt: Date | null | undefined) =>
  !startsAt || !endsAt || endsAt > startsAt

export const listBanners = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const banners = await prisma.banner.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    })
    res.json({ success: true, data: { banners } })
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
    })
    res.status(201).json({ success: true, message: 'Banner created', data: { banner } })
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
    const existing = await prisma.banner.findUnique({ where: { id } })
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
    const banner = await prisma.banner.update({ where: { id }, data })
    res.json({ success: true, message: 'Banner updated', data: { banner } })
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
