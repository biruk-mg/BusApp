# Operator statements and exports

For a company's managers (Operator portal, menu "Statements"):

| What | Where |
|---|---|
| Monthly statement, on screen | `GET /api/v1/operator/statement?month=2026-11` |
| Monthly statement for Excel | `GET /api/v1/operator/statement.csv?month=2026-11` |
| Every ticket sold, for Excel | `GET /api/v1/operator/exports/sales.csv?from=2026-11-01&to=2026-11-30` |

The company always comes from the login, never from the request. Sellers, checkers and customers get 403.

## One rule for the statement

A ticket belongs to the month its **trip departed** (Addis time), not the day it was sold. That is when the company
earns the money, and the moment the Earnings page makes it "available". For the current month only trips that have
already left are counted. The closing balance of a month is the opening balance of the next, and this month's
closing balance equals "owed to you now" on the Earnings page (there is a test for it).

- Commission is the rate frozen on each ticket when it was paid (the company's current rate for older tickets).
- A ticket cancelled with a partial refund adds the part the company kept. A fully refunded ticket adds nothing and is only counted in a note.
- Counter sales are cash the company already holds: shown for information, not in the balance.
- Voided payouts are listed but not counted.
- **The statement is not locked.** It is calculated when opened, so voiding a payout later changes an old month. The generated time is printed on it.

## The sales export

One line per ticket by **sale date** (Addis time), up to 366 days and 50,000 tickets. Unpaid holds that expired are not sales.
It has no passenger names or phone numbers. Text typed by people (notes, names) cannot run as a spreadsheet formula.

## Not built yet

A real .xlsx or .pdf generator (the page prints to PDF from the browser, and the CSV opens in Excel), locking a closed
month, the 2 birr per-seat fee, the payment gateway fee, VAT, an audit log, and an admin view of any company's statement.
