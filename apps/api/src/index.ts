import express from 'express'
import type { Express } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import swaggerUi from 'swagger-ui-express'
import { swaggerSpec } from './swagger'

// ─── Route Imports ──────────────────────────────────────────
import authRoutes from './routes/auth.routes'
import routeRoutes from './routes/route.routes'
import scheduleRoutes from './routes/schedule.routes'
import bookingRoutes from './routes/booking.routes'
import operatorRoutes from './routes/operator.routes'
import paymentRoutes from './routes/payment.routes'
import counterRoutes from './routes/counter.routes'
import checkinRoutes from './routes/checkin.routes'
import ticketRoutes from './routes/ticket.routes'
import adminRoutes from './routes/admin.routes'
import publicRoutes from './routes/public.routes'
import { maybeTopUp } from './lib/recurring'
import { assertEnv } from './lib/env'
import { corsGuard, parseOrigins } from './lib/cors'

// Load environment variables
dotenv.config({ path: '../../.env' })

// Stop with a clear message if a required setting is missing
assertEnv()

const app: Express = express()

// Render (and most hosts) put a proxy in front of the server. Trust it, so that
// req.ip is the passenger's real address and the too-many-tries guards count per person.
app.set('trust proxy', 1)
app.disable('x-powered-by')

/**
 * PORT: Hosting platforms (Render, Railway, etc.) provide a PORT variable.
 * Falling back to 4000 for your local development environment.
 */
const PORT = process.env.PORT || 4000

// ─── Middleware ──────────────────────────────────────────

/**
 * CORS: only the website addresses in the FRONTEND_URL setting (plus local development)
 * may call the API. The guard turns others away with a clear message (see lib/cors.ts).
 */
const allowedOrigins = parseOrigins(process.env.FRONTEND_URL, ['http://localhost:3000'])
console.log(`🔐 CORS allows: ${allowedOrigins.join(', ')}`)

app.use(corsGuard(allowedOrigins))
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
}))

app.use(express.json())

// ─── Route Registration ─────────────────────────────────────
app.use('/api/v1/auth', authRoutes)
app.use('/api/v1/routes', routeRoutes)
app.use('/api/v1/schedules', scheduleRoutes)
app.use('/api/v1/bookings', bookingRoutes)
app.use('/api/v1/operator', operatorRoutes)
app.use('/api/v1/payments', paymentRoutes)
app.use('/api/v1/counter', counterRoutes)
app.use('/api/v1/tickets', ticketRoutes)
app.use('/api/v1/admin', adminRoutes)
app.use('/api/v1/public', publicRoutes)
app.use('/api/v1/checkin', checkinRoutes)
// ─── Swagger Docs ────────────────────────────────────────
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))

console.log('✅ Swiftbus: All routes registered')

// ─── Health Check ──────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: '🚌 Swiftbus API is running!',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  })
})

// ─── Start Server ──────────────────────────────────────────
/**
 * Using '0.0.0.0' is a requirement for many cloud providers 
 * like Render to ensure the service is reachable.
 */
app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`🚌 API running on port: ${PORT}`)
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`)
  // Top up recurring schedules when the server starts (it wakes on Render's free plan)
  maybeTopUp()
})

export default app