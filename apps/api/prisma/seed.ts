import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ||
    'postgresql://postgres:password@localhost:5432/busplatform',
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🌱 Seeding database...')

  // ─── Create Operator ───────────────────────────────────
  const operator = await prisma.operator.upsert({
    where: { licenseNo: 'ET-OP-001' },
    update: {},
    create: {
      companyName: 'Selam Bus',
      licenseNo: 'ET-OP-001',
      phone: '0911000001',
    },
  })
  console.log('✅ Operator created:', operator.companyName)

  // ─── Create Buses ──────────────────────────────────────
  const bus1 = await prisma.bus.upsert({
    where: { plateNumber: 'AA-12345' },
    update: {},
    create: {
      operatorId: operator.id,
      plateNumber: 'AA-12345',
      totalSeats: 45,
      busType: 'STANDARD',
    },
  })

  const bus2 = await prisma.bus.upsert({
    where: { plateNumber: 'AA-67890' },
    update: {},
    create: {
      operatorId: operator.id,
      plateNumber: 'AA-67890',
      totalSeats: 30,
      busType: 'LUXURY',
    },
  })
  console.log('✅ Buses created')

  // ─── Create Routes ─────────────────────────────────────
  const routesData = [
    { fromCity: 'Addis Ababa', toCity: 'Adama',       distanceKm: 99,  estimatedDurationMin: 90  },
    { fromCity: 'Addis Ababa', toCity: 'Hawassa',      distanceKm: 275, estimatedDurationMin: 270 },
    { fromCity: 'Addis Ababa', toCity: 'Bahir Dar',    distanceKm: 467, estimatedDurationMin: 480 },
    { fromCity: 'Addis Ababa', toCity: 'Dire Dawa',    distanceKm: 515, estimatedDurationMin: 540 },
    { fromCity: 'Addis Ababa', toCity: 'Jimma',        distanceKm: 346, estimatedDurationMin: 360 },
    { fromCity: 'Addis Ababa', toCity: 'Mekelle',      distanceKm: 783, estimatedDurationMin: 780 },
    { fromCity: 'Addis Ababa', toCity: 'Gondar',       distanceKm: 727, estimatedDurationMin: 720 },
    { fromCity: 'Hawassa',     toCity: 'Addis Ababa',  distanceKm: 275, estimatedDurationMin: 270 },
    { fromCity: 'Adama',       toCity: 'Addis Ababa',  distanceKm: 99,  estimatedDurationMin: 90  },
  ]

  const routes = []
  for (const r of routesData) {
    const route = await prisma.route.upsert({
      where: { fromCity_toCity: { fromCity: r.fromCity, toCity: r.toCity } },
      update: {},
      create: r,
    })
    routes.push(route)
  }
  console.log('✅ Routes created:', routes.length)

  // ─── Create Schedules ──────────────────────────────────
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)

  const addisAdama = routes.find(r => r.fromCity === 'Addis Ababa' && r.toCity === 'Adama')!
  const addisHawassa = routes.find(r => r.fromCity === 'Addis Ababa' && r.toCity === 'Hawassa')!
  const addisBahirDar = routes.find(r => r.fromCity === 'Addis Ababa' && r.toCity === 'Bahir Dar')!

  const schedulesData = [
    {
      routeId: addisAdama.id,
      busId: bus1.id,
      departureTime: new Date(tomorrow.getTime() + 6 * 60 * 60 * 1000),
      arrivalTime: new Date(tomorrow.getTime() + 7.5 * 60 * 60 * 1000),
      price: 150,
    },
    {
      routeId: addisAdama.id,
      busId: bus2.id,
      departureTime: new Date(tomorrow.getTime() + 9 * 60 * 60 * 1000),
      arrivalTime: new Date(tomorrow.getTime() + 10.5 * 60 * 60 * 1000),
      price: 200,
    },
    {
      routeId: addisHawassa.id,
      busId: bus1.id,
      departureTime: new Date(tomorrow.getTime() + 7 * 60 * 60 * 1000),
      arrivalTime: new Date(tomorrow.getTime() + 11.5 * 60 * 60 * 1000),
      price: 350,
    },
    {
      routeId: addisBahirDar.id,
      busId: bus2.id,
      departureTime: new Date(tomorrow.getTime() + 6 * 60 * 60 * 1000),
      arrivalTime: new Date(tomorrow.getTime() + 14 * 60 * 60 * 1000),
      price: 550,
    },
  ]

  for (const s of schedulesData) {
    await prisma.schedule.create({ data: s })
  }
  console.log('✅ Schedules created')

  console.log('🎉 Seeding complete!')
}

main()
  .catch(console.error)
  .finally(() => pool.end())