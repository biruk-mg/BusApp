/**
 * One-time migration: gives every existing operator account a MANAGER staff record
 * (the old link was "user phone = operator phone"). Safe to run any number of times.
 * The API also does this automatically the first time such a person uses it,
 * so running this is optional, but it lets you check the result straight away.
 *
 *   DATABASE_URL="$NEON_URL" pnpm exec tsx prisma/backfill-staff.ts
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  const users = await prisma.user.findMany({
    where: { role: 'OPERATOR', staff: { is: null } },
    select: { id: true, name: true, phone: true },
  })
  let created = 0
  for (const user of users) {
    const operator = await prisma.operator.findFirst({ where: { phone: user.phone } })
    if (!operator) {
      console.log(`⚠️  ${user.name} (${user.phone}) is an OPERATOR but matches no company: skipped`)
      continue
    }
    await prisma.operatorStaff.create({ data: { userId: user.id, operatorId: operator.id, role: 'MANAGER' } })
    console.log(`✅ ${user.name} is now MANAGER of ${operator.companyName}`)
    created++
  }
  const total = await prisma.operatorStaff.count()
  console.log(`Done. ${created} created, ${total} staff records in total.`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
