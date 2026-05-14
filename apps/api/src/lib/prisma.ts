import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const DATABASE_URL = process.env.DATABASE_URL || 
  'postgresql://postgres:password@localhost:5432/busplatform'

const pool = new Pool({
  connectionString: DATABASE_URL,
})

const adapter = new PrismaPg(pool)

export const prisma = new PrismaClient({ adapter })