import { Request, Response } from 'express'
import QRCode from 'qrcode'
import { prisma } from '../lib/prisma'
import { TICKET_CODE_RE } from '../lib/ticketCode'

// ─── Public ticket page data (no login) ──────────────────
// Anyone with the code can see the ticket, so it never includes the passenger's
// phone number, only what the passenger or a checker needs.
export const getPublicTicket = async (req: Request, res: Response): Promise<void> => {
  try {
    const code = String(req.params.code ?? '').toUpperCase()
    if (!TICKET_CODE_RE.test(code)) {
      res.status(404).json({ success: false, error: 'Ticket not found' })
      return
    }

    const booking = await prisma.booking.findUnique({
      where: { ticketCode: code },
      include: {
        user: { select: { name: true } },
        schedule: { include: { route: true, bus: { select: { plateNumber: true, busType: true, operator: { select: { companyName: true } } } } } },
        pickupPoint: { select: { name: true, offsetMin: true } },
        dropoffPoint: { select: { name: true } },
      },
    })
    if (!booking) {
      res.status(404).json({ success: false, error: 'Ticket not found' })
      return
    }

    const status = booking.status === 'CONFIRMED' || booking.status === 'COMPLETED' ? 'VALID' : 'VOIDED'
    res.json({
      success: true,
      data: {
        ticket: {
          code,
          status,
          passengerName: booking.passengerName ?? booking.user?.name ?? null,
          seatNumbers: booking.seatNumbers,
          totalPrice: booking.totalPrice,
          companyName: booking.schedule.bus.operator.companyName,
          plateNumber: booking.schedule.bus.plateNumber,
          busType: booking.schedule.bus.busType,
          fromCity: booking.schedule.route.fromCity,
          toCity: booking.schedule.route.toCity,
          departureTime: booking.schedule.departureTime,
          arrivalTime: booking.schedule.arrivalTime,
          pickupPoint: booking.pickupPoint,
          dropoffPoint: booking.dropoffPoint,
          qrCode: await QRCode.toDataURL(code),
        },
      },
    })
  } catch (error) {
    console.error('GetPublicTicket error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}
