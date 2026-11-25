# "Your bus is near" alerts

Passengers who turn alerts on get a notification on their phone (standard Web Push, no Firebase).

| Passenger's pickup point | Alerts |
|---|---|
| 1st pickup point of the route | `DEPART_SOON`: 30 minutes before the scheduled departure |
| 2nd and later | `TRIP_STARTED` (checker starts the trip), `HALFWAY` (bus is halfway between the start and their pickup, 4th stop and later), `NEXT_STOP` (bus reached the stop before theirs) |

Every message names the passenger's pickup point. Moving alerts also give the straight-line distance in km.
If several alerts are due at once (a bus out of signal, a late booking) only the latest is sent.

## Settings (API server)

| Setting | What |
|---|---|
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Make them once: `npx web-push generate-vapid-keys`. Never change them later (every phone would need to subscribe again). |
| `VAPID_SUBJECT` | `mailto:you@yourdomain` |
| `ALERTS_CRON_SECRET` | A long random text. Without it, `/internal/alerts/tick` does not exist. |

Without the three VAPID settings the feature is off and nothing else changes.

## The outside clock

The API sleeps on a free plan, so the 30-minute reminder needs something outside to call it once a minute:

    POST https://<api>/api/v1/internal/alerts/tick      header:  x-cron-secret: <ALERTS_CRON_SECRET>

Any free cron service works, or a Render cron job.

## How it works

- `lib/arrivalAlerts.ts`: the rules and the wording (plain functions, no database).
- `lib/arrivalAlertRunner.ts`: reads the database and sends. `onLocation` runs after each position the checker's phone sends; `runDepartSoon` runs on the tick.
- `ArrivalAlert` table: one row per booking, pickup point and alert type. The unique key is the claim that stops a double send: only the request that inserts the row sends.
- `Schedule.pickupProgress`: how far along its pickup points the bus is. Only moves forward.
- `PushSubscription` table: the phones that agreed. A phone that the push service reports as gone is deleted.
- An alert is sent AT MOST once. If the server dies between claiming and sending, that alert is lost, never doubled.
- Notifications expire after 5 minutes, so a phone that was offline never shows a stale "arriving".

## Limits to know

- Distance is a straight line, so it is shorter than the road.
- A pickup point without a map position cannot be detected; the nearest earlier one that has one is used.
- The Amharic text is a first draft: have a native speaker read it. Afaan Oromo uses the English text for now.
- iPhone: alerts only work once MugoBus is added to the Home Screen.
