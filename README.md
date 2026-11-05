# Cipher Concierge

A private hotel concierge that guests reach by scanning a QR card in their room. It runs only on **Cipher 2.0**, Cipher CTS's own model. No third-party AI, CDN, fonts, or analytics.

> Branch `cipher-demo`: the GM demo build. The hotel data for The Oliver and The Tennessean is **sample data** and hasn't been confirmed by those hotels.

## How it answers
1. **Facts engine** (`lib/intents.js`). Common guest questions get deterministic answers straight from the hotel file (`config/hotels/<id>.json`): checkout/check-in, late checkout, Wi-Fi, breakfast and dining (with "open now" for the hotel's time zone), parking, pool, gym, towels/housekeeping, maintenance, front desk, directions, local recommendations, amenities, pets, smoking, quiet hours, noise, lockouts, emergencies (911 first). Missing facts never get invented; the guest is sent to the front desk with tap-to-call.
2. **Cipher** (`lib/cipher.js`). Handles other open questions only. The top matching hotel facts go into a short server-side prompt sent to `cipher-serve`.
3. **Guard + fallback.** A Cipher answer is dropped if it's empty, repetitive, names a different hotel, or states a number (time, price) that isn't in the retrieved facts. In those cases, and whenever cipher-serve is down, the guest gets "Let me connect you to the front desk" with a call button. Hotel-specific questions with no matching fact (e.g. "do you have a spa?") skip the model entirely.

## Run it
```bash
# 1. Cipher (from Cipher_bot, branch cipher-runtime)
cd Cipher_bot/native/cipher-serve && make OUT=/tmp/cs
/tmp/cs/cipher-serve --model /path/to/sft.ctern --port 8899 --id cipher-2.0 --threads 4
# 2. App
cp .env.example .env.local   # set QR_SECRET (openssl rand -base64 48) and ADMIN_KEY
npm ci && npm run build && npm start      # http://localhost:3000
```
- `/` is the GM landing page. `/demo` (when `DEMO_MODE=1`) opens signed demo rooms.
- `/stay/<hotel>/<room>?t=<token>` is the guest chat (what the QR opens).
- `/admin/qr?key=<ADMIN_KEY>&hotel=the-oliver&rooms=301-310,412` prints QR room cards.
- `/api/health` reports whether the app and Cipher are up.

## Signed room QR tokens
`t = base64url(HMAC-SHA256(QR_SECRET, "v<QR_KEY_VERSION>|<hotelId>|<roomId>"))`, first 22 characters (about 131 bits).
- The server checks the token on page load and on every chat request, using a constant-time compare. If a guest edits the room number in the link, the token no longer matches, and they're asked to scan the card in their room.
- To retire every printed card at once (lost cards, a breach), bump `QR_KEY_VERSION` or change `QR_SECRET`, then reprint.
- Limitation: a token is a room-level credential, not a stay-level one. A past guest who kept a photo of the card can still open the chat until you rotate. That's fine while the app holds no per-guest data. Before adding room-bound actions (charges, requests tied to a guest), add stay-level tokens issued at check-in.
- Production refuses to start chat without a `QR_SECRET` of 32+ characters.

## Security and privacy
- Accepts only `user`/`assistant` messages from the browser (the system prompt is server-only), at most 8 messages of 500 characters each, and a 16 KB body.
- Rate limits are in memory: 20 requests/min per client and 30/min per room. The keys are hashed and expire after a minute.
- Nothing is stored server-side, and message content is never logged. The chat lives only in the browser tab.
- CSP is `default-src 'self'`, with no third-party origins. Also set: `Referrer-Policy: no-referrer`, `noindex` on `/stay` and `/admin`, and Next telemetry disabled in every npm script.
- Fonts (Inter, Plus Jakarta Sans, OFL) are self-hosted through `@fontsource`.

## Hotel info
There's one JSON file per hotel in `config/hotels/`, all with the same schema. Drop in a new file to add a hotel. Set a field to `null` when it's unknown, and the concierge will send guests to the front desk for it. `_meta.confirmWithHotel` lists what still needs confirming. (A web editor isn't built yet.)

## Tests
- `npm test`: unit tests (tokens, SSE parser split-chunk fix, sanitizing, rate limit, hours, intents, guard, answer routing).
- `npm run testset -- <label>`: 44 realistic guest questions per hotel (including 2-3 AM scenarios), run against the live cipher-serve. Results go to `tests/results/<date>_<label>.md`. Rerun with the 369M and diff.
- `node scripts/holdout2.js`: paraphrases that weren't used to tune the rules (honest generalization check).

## Hosting
See [docs/HOSTING.md](docs/HOSTING.md) for VPS vs. on-prem, measured cipher-serve RAM/CPU/tok/s, the ARM build, and hardware prices.
