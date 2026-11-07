import type { User, StaffRole } from '@bus/types'

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  MANAGER: 'Manager',
  SELLER: 'Counter seller',
  CHECKER: 'Ticket checker',
}

/** The page each kind of person lands on after login. */
export function homeFor(user: User | null | undefined): string {
  if (!user) return '/login'
  if (user.role === 'ADMIN') return '/admin'
  if (user.role === 'OPERATOR' && user.staff) {
    if (user.staff.role === 'MANAGER') return '/operator'
    if (user.staff.role === 'SELLER') return '/counter'
    if (user.staff.role === 'CHECKER') return '/checker'
  }
  return '/'
}
