import { prisma } from './prisma'

/**
 * Finds the Operator company that belongs to a logged-in user.
 * Currently the link is made by matching phone numbers (same as the
 * operator controller). A proper userId column is a planned improvement.
 */
export async function getOperatorForUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return null
  return prisma.operator.findFirst({ where: { phone: user.phone } })
}
