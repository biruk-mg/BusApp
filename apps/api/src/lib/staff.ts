import { PrismaClient } from '@prisma/client'
import { prisma as defaultPrisma } from './prisma'

export type StaffRoleValue = 'MANAGER' | 'SELLER' | 'CHECKER'
export const STAFF_ROLES: StaffRoleValue[] = ['MANAGER', 'SELLER', 'CHECKER']

export interface StaffContext {
  staffId: string
  operatorId: string
  role: StaffRoleValue
}

const isUniqueError = (e: unknown) => (e as { code?: string })?.code === 'P2002'

/**
 * What a logged-in user may do at an operator company. Returns null when the
 * person is not (or is no longer) active staff anywhere.
 *
 * Read from the database on every call, never from the login token, so
 * deactivating someone works at once even though their token lasts 7 days.
 *
 * Migration of the old phone-number link: an OPERATOR user that has no staff
 * record yet is matched to the company with the same phone number and becomes
 * its MANAGER, once. A person who already has a staff record (even a
 * deactivated one) is never matched this way again.
 */
export async function getStaffContext(
  userId: string,
  client: PrismaClient = defaultPrisma
): Promise<StaffContext | null> {
  const existing = await client.operatorStaff.findUnique({ where: { userId } })
  if (existing) {
    return existing.active
      ? { staffId: existing.id, operatorId: existing.operatorId, role: existing.role }
      : null
  }

  const user = await client.user.findUnique({ where: { id: userId } })
  if (!user || user.role !== 'OPERATOR') return null
  const operator = await client.operator.findFirst({ where: { phone: user.phone } })
  if (!operator) return null

  try {
    const created = await client.operatorStaff.create({
      data: { userId, operatorId: operator.id, role: 'MANAGER' },
    })
    return { staffId: created.id, operatorId: created.operatorId, role: created.role }
  } catch (error) {
    // Two requests migrated the same person at the same moment: read the winner
    if (!isUniqueError(error)) throw error
    const again = await client.operatorStaff.findUnique({ where: { userId } })
    return again?.active ? { staffId: again.id, operatorId: again.operatorId, role: again.role } : null
  }
}

/** Staff details for the login response and /auth/me (null for passengers and the admin). */
export async function describeStaff(userId: string, client: PrismaClient = defaultPrisma) {
  const ctx = await getStaffContext(userId, client)
  if (!ctx) return null
  const operator = await client.operator.findUnique({
    where: { id: ctx.operatorId },
    select: { companyName: true },
  })
  return { role: ctx.role, operatorId: ctx.operatorId, companyName: operator?.companyName ?? '' }
}
