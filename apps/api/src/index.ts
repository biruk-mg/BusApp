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
import { maybeTopUp } from './lib/recurring'

// Load environment variables
dotenv.config({ path: '../../.env' })

const app: Express = express()

/**
 * PORT: Hosting platforms (Render, Railway, etc.) provide a PORT variable.
 * Falling back to 4000 for your local development environment.
 */
const PORT = process.env.PORT || 4000

// ─── Middleware ──────────────────────────────────────────

/**
 * CORS Configuration:
 * Allowed origins come from the FRONTEND_URL env variable
 * (comma-separated, e.g. "https://mugobus.vercel.app,https://mugobus.com").
 * Requests with no Origin header (mobile app, curl, server-to-server) are allowed.
 */
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean)
allowedOrigins.push('http://localhost:3000') // Local Next.js dev server

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
    return callback(new Error(`CORS: origin not allowed: ${origin}`))
  },
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