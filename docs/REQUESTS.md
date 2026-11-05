# Guest requests (towels, housekeeping, maintenance)

**Guest:** on the room QR stay page, tap **Request help** (or **Send to front desk** under a towels/maintenance answer). Pick Towels / Housekeeping / Something broken, add an optional note (max 200 chars), Send.
The request is sent with the room QR token (`hotelId` + `roomId` + `t`), verified with `verifyRoom` exactly like chat. Billing pause blocks it like chat.

**Staff:** sign in at `/login`, open **Requests** (`/requests`). Open requests show room, type, note and time; tap **Done**. The page refreshes every 20 seconds.

**API**
- `POST /api/requests` `{ hotelId, roomId, t, type, note? }` — guest create. Rate-limited per IP (5/min), per room (3/min) and per room per hour (12, shared in Redis).
- `GET /api/requests?status=open` — manager list, hotel from session only.
- `POST /api/requests/<id>/done` — manager marks done, hotel from session only.

**Storage (Redis, `cc:v1:` prefix):** `req:<hotelId>:<id>` → `{ id, hotelId, roomId, type, note, status, createdAt, doneAt? }` (expires after 30 days); `reqlist:<hotelId>` → newest 200 ids.

**Privacy:** only the explicit request is stored. Chat content is never stored; the "Send to front desk" button under a chat answer sends the type only, not the guest's question.
