/**
 * DEMO DATA for pickup / drop-off points.
 *
 * Adds, for the demo operator "Selam Bus":
 *  - routes Addis Ababa -> Hossana and Hossana -> Addis Ababa (if missing)
 *  - pickup points on Addis Ababa -> Hossana (Lamberet is the main station)
 *  - drop-off points in Addis Ababa on Hossana -> Addis Ababa
 *  - a few demo trips for tomorrow and the day after
 *
 * The names are the places you described; the minutes between stops and the
 * prices are PLACEHOLDERS until a real operator confirms them.
 * Safe to run more than once.
 *
 * Run from apps/api:
 *   DATABASE_URL="<direct url>" pnpm exec tsx prisma/seed-demo-pickups.ts
 */
import { prisma } from '../src/lib/prisma'

const EAT_OFFSET_H = 3 // Ethiopia is UTC+3 all year

// Build a Date from a local Addis Ababa date/time
const eat = (y: number, m: number, d: number, hour: number, minute = 0) =>
  new Date(Date.UTC(y, m, d, hour - EAT_OFFSET_H, minute))

async function main() {
  const operator = await prisma.operator.findUnique({ where: { licenseNo: 'ET-OP-001' } })
  if (!operator) throw new Error('Demo operator Selam Bus (ET-OP-001) not found')

  const route = async (fromCity: string, toCity: string, distanceKm: number, estimatedDurationMin: number) =>
    prisma.route.upsert({
      where: { fromCity_toCity: { fromCity, toCity } },
      update: {},
      create: { fromCity, toCity, distanceKm, estimatedDurationMin },
    })

  const toHossana = await route('Addis Ababa', 'Hossana', 230, 270)
  const toAddis = await route('Hossana', 'Addis Ababa', 230, 270)

  const point = (routeId: string, name: string, kind: 'PICKUP' | 'DROPOFF' | 'BOTH', sequence: number, offsetMin: number) =>
    prisma.pickupPoint.upsert({
      where: { operatorId_routeId_name: { operatorId: operator.id, routeId, name } },
      update: {},
      create: { operatorId: operator.id, routeId, name, kind, sequence, offsetMin },
    })

  // Addis Ababa -> Hossana: boarding order
  await point(toHossana.id, 'Lamberet (main station)', 'PICKUP', 0, 0)
  await point(toHossana.id, 'Megenagna', 'PICKUP', 1, 30)
  await point(toHossana.id, 'Mexico', 'PICKUP', 2, 45)
  await point(toHossana.id, 'Lideta', 'PICKUP', 3, 60)
  await point(toHossana.id, 'Garment', 'PICKUP', 4, 75)

  // Hossana -> Addis Ababa: where passengers can get off in Addis
  await point(toAddis.id, 'Garment', 'DROPOFF', 1, 0)
  await point(toAddis.id, 'Lideta', 'DROPOFF', 2, 0)
  await point(toAddis.id, 'Mexico', 'DROPOFF', 3, 0)
  await point(toAddis.id, 'Megenagna', 'DROPOFF', 4, 0)
  await point(toAddis.id, 'Lamberet (main station)', 'DROPOFF', 5, 0)

  // Demo trips (Addis Ababa date)
  const buses = await prisma.bus.findMany({ where: { operatorId: operator.id }, orderBy: { totalSeats: 'desc' } })
  const [bigBus, luxBus] = [buses[0], buses[1] ?? buses[0]]
  const eatNow = new Date(Date.now() + EAT_OFFSET_H * 3600e3)

  let created = 0
  for (const dayOffset of [1, 2]) {
    const d = new Date(eatNow.getTime() + dayOffset * 86400e3)
    const [Y, M, D] = [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()]
    const trips = [
      { r: toHossana, bus: bigBus, h: 5, price: 330 },
      { r: toHossana, bus: luxBus, h: 8, price: 450 },
      { r: toAddis, bus: bigBus, h: 14, price: 330 },
    ]
    for (const t of trips) {
      const departureTime = eat(Y, M, D, t.h)
      const exists = await prisma.schedule.findFirst({ where: { busId: t.bus.id, departureTime } })
      if (exists) continue
      await prisma.schedule.create({
        data: {
          routeId: t.r.id,
          busId: t.bus.id,
          departureTime,
          arrivalTime: new Date(departureTime.getTime() + t.r.estimatedDurationMin * 60000),
          price: t.price,
        },
      })
      created++
    }
  }

  console.log(`Demo data ready. Pickup points set up; ${created} new demo trip(s) created.`)
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
