import express from 'express'
import type { Express } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import operatorRoutes from './routes/operator.routes'
import paymentRoutes from './routes/payment.routes'

dotenv.config({ path: '../../.env' })

const app: Express = express()
const PORT = process.env.PORT || 4000

// ─── Middleware ──────────────────────────────────────────
app.use(cors())
app.use(express.json())
app.use('/api/v1/operator', operatorRoutes)
app.use('/api/v1/payments', paymentRoutes)

// ─── Routes ─────────────────────────────────────────────
import authRoutes from './routes/auth.routes'
import routeRoutes from './routes/route.routes'
import scheduleRoutes from './routes/schedule.routes'
import bookingRoutes from './routes/booking.routes'

app.use('/api/v1/auth', authRoutes)
app.use('/api/v1/routes', routeRoutes)
app.use('/api/v1/schedules', scheduleRoutes)
app.use('/api/v1/bookings', bookingRoutes)

console.log('✅ All routes registered')

// ─── Health Check ────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: '🚌 Bus Platform API is running!',
    timestamp: new Date().toISOString(),
  })
})

// ─── Start Server ────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚌 API running on http://localhost:${PORT}`)
  console.log(`📦 Environment: ${process.env.NODE_ENV}`)
})

export default app