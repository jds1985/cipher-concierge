# Hosting on Vercel (Hobby / free)

Guest flow on Vercel alone:

1. **Hotel facts** — answered by the Next.js app from `config/hotels/*.json`. No always-on process.
2. **On-phone Cipher** — the guest browser downloads `/cipher/models/sft.ctern` (fetched at build time from the `model-sft-135m` GitHub release) and runs WASM in-page. Same-origin only (CSP + COEP).
3. **Front-desk handoff** — when a question needs the model and the phone can't run it, or the guard rejects an open answer, the guest gets a call button.

Set in Vercel Production:

- `QR_SECRET` (32+ chars), `QR_KEY_VERSION`, `ADMIN_KEY`, `PUBLIC_BASE_URL=https://cipher-concierge.vercel.app`
- `CIPHER_SERVER_MODEL=off` (cipher-serve cannot run on Vercel serverless)
- `CIPHER_OPEN_QUESTIONS=on` (on-phone still tries open questions; server path falls back)
- `DEMO_MODE=1` if you want `/demo`

Do **not** set `MODEL_API_KEY`, Groq, Deepgram, or any third-party AI key. There is no third-party AI path in this app.

Missing without a separate host: server-side `cipher-serve` generations (open questions when the phone can't load WASM). Facts + desk handoff still work.
