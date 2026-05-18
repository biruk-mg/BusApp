import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://postgres:password@localhost:5432/busplatform',
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🌱 Seeding database...')

  // ─── Operators ─────────────────────────────────────────
  const operatorsData = [
    { companyName: 'Selam Bus',    licenseNo: 'ET-OP-001', phone: '0911000001' },
    { companyName: 'Sky Bus',      licenseNo: 'ET-OP-002', phone: '0911000002' },
    { companyName: 'Limalimo Bus', licenseNo: 'ET-OP-003', phone: '0911000003' },
    { companyName: 'Golden Bus',   licenseNo: 'ET-OP-004', phone: '0911000004' },
    { companyName: 'Abay Bus',     licenseNo: 'ET-OP-005', phone: '0911000005' },
  ]

  const operators = []
  for (const op of operatorsData) {
    const operator = await prisma.operator.upsert({
      where: { licenseNo: op.licenseNo },
      update: {},
      create: op,
    })
    operators.push(operator)
  }
  console.log('✅ Operators created:', operators.length)

  // ─── Buses (10 per operator) ───────────────────────────
  const busConfigs = [
    { prefix: 'SL', luxury: 5, standard: 5, luxurySeats: 45, standardSeats: 55 }, // Selam
    { prefix: 'SK', luxury: 6, standard: 4, luxurySeats: 40, standardSeats: 50 }, // Sky
    { prefix: 'LM', luxury: 4, standard: 6, luxurySeats: 45, standardSeats: 55 }, // Limalimo
    { prefix: 'GL', luxury: 3, standard: 7, luxurySeats: 40, standardSeats: 60 }, // Golden
    { prefix: 'AB', luxury: 3, standard: 7, luxurySeats: 45, standardSeats: 60 }, // Abay
  ]

  const allBuses: { bus: any; operatorIndex: number }[] = []

  for (let i = 0; i < operators.length; i++) {
    const op = operators[i]
    const config = busConfigs[i]
    let busCount = 1

    for (let j = 0; j < config.luxury; j++) {
      const plateNumber = `AA-${config.prefix}-L${String(busCount).padStart(2, '0')}`
      const bus = await prisma.bus.upsert({
        where: { plateNumber },
        update: {},
        create: {
          operatorId: op.id,
          plateNumber,
          totalSeats: config.luxurySeats,
          busType: 'LUXURY',
        },
      })
      allBuses.push({ bus, operatorIndex: i })
      busCount++
    }

    for (let j = 0; j < config.standard; j++) {
      const plateNumber = `AA-${config.prefix}-S${String(busCount).padStart(2, '0')}`
      const bus = await prisma.bus.upsert({
        where: { plateNumber },
        update: {},
        create: {
          operatorId: op.id,
          plateNumber,
          totalSeats: config.standardSeats,
          busType: 'STANDARD',
        },
      })
      allBuses.push({ bus, operatorIndex: i })
      busCount++
    }

    console.log(`✅ Buses created for ${op.companyName}`)
  }

  // ─── Routes (20: 10 outbound + 10 return) ──────────────
  const routesData = [
    { fromCity: 'Addis Ababa', toCity: 'Adama',      distanceKm: 99,  estimatedDurationMin: 90  },
    { fromCity: 'Addis Ababa', toCity: 'Hawassa',    distanceKm: 275, estimatedDurationMin: 270 },
    { fromCity: 'Addis Ababa', toCity: 'Bahir Dar',  distanceKm: 467, estimatedDurationMin: 480 },
    { fromCity: 'Addis Ababa', toCity: 'Dire Dawa',  distanceKm: 515, estimatedDurationMin: 540 },
    { fromCity: 'Addis Ababa', toCity: 'Jimma',      distanceKm: 346, estimatedDurationMin: 360 },
    { fromCity: 'Addis Ababa', toCity: 'Mekelle',    distanceKm: 783, estimatedDurationMin: 780 },
    { fromCity: 'Addis Ababa', toCity: 'Gondar',     distanceKm: 727, estimatedDurationMin: 720 },
    { fromCity: 'Addis Ababa', toCity: 'Dessie',     distanceKm: 401, estimatedDurationMin: 420 },
    { fromCity: 'Addis Ababa', toCity: 'Nekemte',    distanceKm: 331, estimatedDurationMin: 360 },
    { fromCity: 'Addis Ababa', toCity: 'Shashamane', distanceKm: 250, estimatedDurationMin: 240 },
    { fromCity: 'Adama',      toCity: 'Addis Ababa', distanceKm: 99,  estimatedDurationMin: 90  },
    { fromCity: 'Hawassa',    toCity: 'Addis Ababa', distanceKm: 275, estimatedDurationMin: 270 },
    { fromCity: 'Bahir Dar',  toCity: 'Addis Ababa', distanceKm: 467, estimatedDurationMin: 480 },
    { fromCity: 'Dire Dawa',  toCity: 'Addis Ababa', distanceKm: 515, estimatedDurationMin: 540 },
    { fromCity: 'Jimma',      toCity: 'Addis Ababa', distanceKm: 346, estimatedDurationMin: 360 },
    { fromCity: 'Mekelle',    toCity: 'Addis Ababa', distanceKm: 783, estimatedDurationMin: 780 },
    { fromCity: 'Gondar',     toCity: 'Addis Ababa', distanceKm: 727, estimatedDurationMin: 720 },
    { fromCity: 'Dessie',     toCity: 'Addis Ababa', distanceKm: 401, estimatedDurationMin: 420 },
    { fromCity: 'Nekemte',    toCity: 'Addis Ababa', distanceKm: 331, estimatedDurationMin: 360 },
    { fromCity: 'Shashamane', toCity: 'Addis Ababa', distanceKm: 250, estimatedDurationMin: 240 },
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

  // ─── Prices per route ──────────────────────────────────
  const routePrices: Record<string, { standard: number; luxury: number }> = {
    'Addis Ababa-Adama':      { standard: 120,  luxury: 180  },
    'Addis Ababa-Hawassa':    { standard: 280,  luxury: 420  },
    'Addis Ababa-Bahir Dar':  { standard: 450,  luxury: 680  },
    'Addis Ababa-Dire Dawa':  { standard: 500,  luxury: 750  },
    'Addis Ababa-Jimma':      { standard: 350,  luxury: 520  },
    'Addis Ababa-Mekelle':    { standard: 750,  luxury: 1100 },
    'Addis Ababa-Gondar':     { standard: 700,  luxury: 1050 },
    'Addis Ababa-Dessie':     { standard: 400,  luxury: 600  },
    'Addis Ababa-Nekemte':    { standard: 320,  luxury: 480  },
    'Addis Ababa-Shashamane': { standard: 250,  luxury: 380  },
    'Adama-Addis Ababa':      { standard: 120,  luxury: 180  },
    'Hawassa-Addis Ababa':    { standard: 280,  luxury: 420  },
    'Bahir Dar-Addis Ababa':  { standard: 450,  luxury: 680  },
    'Dire Dawa-Addis Ababa':  { standard: 500,  luxury: 750  },
    'Jimma-Addis Ababa':      { standard: 350,  luxury: 520  },
    'Mekelle-Addis Ababa':    { standard: 750,  luxury: 1100 },
    'Gondar-Addis Ababa':     { standard: 700,  luxury: 1050 },
    'Dessie-Addis Ababa':     { standard: 400,  luxury: 600  },
    'Nekemte-Addis Ababa':    { standard: 320,  luxury: 480  },
    'Shashamane-Addis Ababa': { standard: 250,  luxury: 380  },
  }

  // ─── Departure times per operator ─────────────────────
  const departureTimes = [
    [6,  0],  // Selam Bus   - 6:00 AM
    [7, 30],  // Sky Bus     - 7:30 AM
    [9,  0],  // Limalimo    - 9:00 AM
    [11, 0],  // Golden Bus  - 11:00 AM
    [14, 0],  // Abay Bus    - 2:00 PM
  ]

  // ─── 30 days of schedules ─────────────────────────────
  console.log('⏳ Creating 30 days of schedules...')
  let scheduleCount = 0

  for (let day = 1; day <= 30; day++) {
    const date = new Date()
    date.setDate(date.getDate() + day)
    date.setHours(0, 0, 0, 0)

    for (const { bus, operatorIndex } of allBuses) {
      const routeIndex = (operatorIndex * 2 + day) % routes.length
      const route = routes[routeIndex]
      const priceKey = `${route.fromCity}-${route.toCity}`
      const prices = routePrices[priceKey] || { standard: 200, luxury: 350 }
      const price = bus.busType === 'LUXURY' ? prices.luxury : prices.standard

      const [hour, minute] = departureTimes[operatorIndex]
      const departureTime = new Date(date)
      departureTime.setHours(hour, minute, 0, 0)

      const arrivalTime = new Date(
        departureTime.getTime() + route.estimatedDurationMin * 60 * 1000
      )

      await prisma.schedule.create({
        data: {
          routeId: route.id,
          busId: bus.id,
          departureTime,
          arrivalTime,
          price,
        },
      })
      scheduleCount++
    }
  }

  console.log(`✅ Schedules created: ${scheduleCount}`)
  console.log('🎉 Seeding complete!')
}

main()
  .catch(console.error)
  .finally(() => pool.end())