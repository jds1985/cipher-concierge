# Manager usage stats

Managers see a simple **Usage** page (`/usage`) with how much guests use Concierge: questions answered, staff requests sent/completed, and top topics. Large type, high contrast.

## Privacy (non-negotiable)

`/api/chat` still stores **no conversation content**. Stats are **aggregate counters only**:

- Never stored: guest message text, chat notes, room-level chat logs, or PII tying a room to a question.
- Counted: number of server answers, breakdown by intent/kind (wifi, checkout, housekeeping, maintenance, cipher, fallback, …), staff requests created and marked done.

Request notes stay in the requests feature only; they are never copied into stats.

## What is counted

| Event | Counted? |
| --- | --- |
| Successful `/api/chat` answer | Yes — `questions` + intent |
| Guest creates a staff request | Yes — `requestsCreated` |
| Manager marks a request done | Yes — `requestsDone` |
| On-phone (WASM) answers that never hit `/api/chat` | **No** (v1 gap) |

Usage therefore reflects **server** answers + staff requests. Phone-only answers may under-count until a future rate-limited ping exists.

## Storage (Redis, `cc:v1:` prefix)

`stat:<hotelId>:day:<YYYY-MM-DD>` → `{ questions, byIntent: { wifi: n, … }, requestsCreated, requestsDone }` with ~90-day TTL.

Counter bumps soft-fail if Redis is down so chat and requests never break.

## API

`GET /api/stats?range=today|7d|30d` — session required; hotelId from the session only. Returns totals + a sorted `byIntent` list.

## UI

Signed-in managers: `/usage` (also linked from Setup / Requests / Billing nav). Range toggle: Today / 7 days / 30 days. Empty state: “No guest activity yet. Share a room QR to get started.”
