import express from 'express'
import type { Express } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

// ─── Route Imports ──────────────────────────────────────────
import authRoutes from './routes/auth.routes'
import routeRoutes from './routes/route.routes'
import scheduleRoutes from './routes/schedule.routes'
import bookingRoutes from './routes/booking.routes'
import operatorRoutes from './routes/operator.routes'
import paymentRoutes from './routes/payment.routes'

// Load environment variables
dotenv.config({ path: '../../.env' })

const app: Express = express()

/**
 * PORT: Railway automatically provides a PORT variable.
 * Falling back to 4000 for your local development environment.
 */
const PORT = process.env.PORT || 4000

// ─── Middleware ──────────────────────────────────────────

/**
 * CORS Configuration:
 * In production, we restrict access to your specific frontend URL 
 * to prevent unauthorized external requests.
 */
app.use(cors({
  origin: [
    'https://busapi-production.up.railway.app', // Your API domain from settings
    /\.railway\.app$/,                          // Matches any railway app domain
    'http://localhost:3000'                    // Local Next.js dev server
  ],
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
 * like Railway to ensure the service is reachable.
 */
app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`🚌 API running on port: ${PORT}`)
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`)
})

export default app