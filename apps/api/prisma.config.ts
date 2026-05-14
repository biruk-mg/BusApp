import path from 'path'
import { config } from 'dotenv'
import { defineConfig, env } from 'prisma/config'

// Explicitly load root .env
config({ path: path.resolve(__dirname, '../../.env') })

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
  },
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://placeholder:placeholder@localhost:5432/placeholder',
  },
})