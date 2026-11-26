import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { companyOf } from '../middleware/staff'
import { addisDateString, isValidDateString } from '../lib/time'
import { MAX_EXPORT_DAYS, currentMonth, isMonthString, loadSalesExport, loadStatement, monthRange, salesExportCsv, statementCsv } from '../lib/statement'

/**
 * A company's own statement and exports (managers only). The company always comes from the
 * login (companyOf), never from the URL or the query, so no one can ask for another company's.
 */

const bad = (res: Response, message: string): null => {
  res.status(400).json({ success: false, error: message })
  return null
}
const serverError = (res: Response, name: string, error: unknown) => {
  console.error(`${name} error:`, error)
  res.status(500).json({ success: false, error: 'Internal server error' })
}

function readMonth(req: AuthRequest, res: Response): string | null {
  const month = req.query.month ?? currentMonth()
  if (!isMonthString(month)) return bad(res, 'month must look like 2026-11')
  if (monthRange(month).start.getTime() > Date.now()) return bad(res, 'That month has not started yet')
  return month
}

// The file name is ASCII only (company names can be in any script); financial data is never cached
function sendCsv(res: Response, baseName: string, body: string): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Disposition', `attachment; filename="${baseName}.csv"`)
  res.send(body)
}
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'company'

/** GET /operator/statement?month=2026-11 */
export const getMyStatement = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const operatorId = companyOf(req, res)
    if (!operatorId) return
    const month = readMonth(req, res)
    if (!month) return
    const statement = await loadStatement(operatorId, month)
    if (!statement) {
      res.status(404).json({ success: false, error: 'Company not found' })
      return
    }
    res.setHeader('Cache-Control', 'no-store')
    res.json({ success: true, data: statement })
  } catch (error) {
    serverError(res, 'GetMyStatement', error)
  }
}

/** GET /operator/statement.csv?month=2026-11 */
export const downloadMyStatementCsv = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const operatorId = companyOf(req, res)
    if (!operatorId) return
    const month = readMonth(req, res)
    if (!month) return
    const statement = await loadStatement(operatorId, month)
    if (!statement) {
      res.status(404).json({ success: false, error: 'Company not found' })
      return
    }
    sendCsv(res, `mugobus-statement-${slug(statement.company.companyName)}-${month}`, statementCsv(statement))
  } catch (error) {
    serverError(res, 'DownloadMyStatementCsv', error)
  }
}

/** GET /operator/exports/sales.csv?from=2026-11-01&to=2026-11-30  (Addis dates, both days included) */
export const downloadMySalesCsv = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const operatorId = companyOf(req, res)
    if (!operatorId) return
    const today = addisDateString(new Date())
    const from = req.query.from ?? today.slice(0, 8) + '01'
    const to = req.query.to ?? today
    if (typeof from !== 'string' || typeof to !== 'string' || !isValidDateString(from) || !isValidDateString(to)) {
      bad(res, 'from and to must be dates like 2026-11-30')
      return
    }
    if (from > to) {
      bad(res, 'from must not be after to')
      return
    }
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1
    if (days > MAX_EXPORT_DAYS) {
      bad(res, `Choose at most ${MAX_EXPORT_DAYS} days at a time`)
      return
    }
    const result = await loadSalesExport(operatorId, from, to)
    if (!result) {
      res.status(404).json({ success: false, error: 'Company not found' })
      return
    }
    if (result.tooMany) {
      res.status(413).json({ success: false, error: 'Too many tickets in that range. Choose fewer days.' })
      return
    }
    sendCsv(res, `mugobus-sales-${slug(result.operator.companyName)}-${from}-to-${to}`, salesExportCsv(result.lines))
  } catch (error) {
    serverError(res, 'DownloadMySalesCsv', error)
  }
}
