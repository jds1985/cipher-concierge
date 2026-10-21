# Hosting Cipher Concierge (demo and pilot)

The app is two processes that must sit on the **same machine** (cipher-serve only listens on 127.0.0.1):

1. `cipher-serve`, the Cipher 2.0 C runtime with an OpenAI-compatible API (`/workspace/Cipher_bot/native/cipher-serve`, branch `cipher-runtime`)
2. The Next.js app (`npm run build && npm start`), which talks to it through `CIPHER_URL`

There is no third-party AI, CDN, font host, or analytics. The only outbound traffic is what the guest's own browser sends to this server.

## How guest questions use Cipher (this drives the hardware needs)
Most guest questions (checkout, Wi-Fi, breakfast, parking, towels, locked out, and so on) are answered by the **facts engine**. That's plain JavaScript reading the hotel JSON, it never calls Cipher, and it answers in about 1 ms. Only open-ended questions go to Cipher. And cipher-serve currently handles **one generation at a time** (single accept loop), so simultaneous Cipher questions wait in line. Set `CIPHER_OPEN_QUESTIONS=off` to send every non-fact question to the front desk instead. That's recommended for GM demos until the 369M model is in.

## Measured on this box (x86-64 Xeon, 8 vCPU, AVX2 build), 2026-10-21
Method: `docs/bench/bench.mjs`. N guests send a Cipher-path question at the same moment. The prompt is about the app's real size, `max_tokens` is 120 and `ignore_eos` is on, so every request generates the full 120 tokens. RSS and CPU are read from /proc.

| Model file | Threads | Guests at once | Idle RSS | Peak RSS | Cores busy | Total tok/s | First token, median / worst | Full answer, median / worst |
|---|---|---|---|---|---|---|---|---|
| 135M `sft.ctern` (73 MB) | 4 | 1 | 6 MB | 72 MB | 3.5 | 213 | 0.22 s | 0.56 s |
| 135M | 4 | 5 | | 76 MB | 3.9 | 234 | 1.1 / 2.1 s | 1.4 / 2.5 s |
| 135M | 4 | 20 | | 81 MB | 3.9 | 223 | 5.5 / 10.4 s | 5.9 / 10.7 s |
| 135M | 1 | 1 / 5 / 20 | | 72-80 MB | 1.0 | ~100 | 0.48 s / 2.8 s / 12.4 s (median) | worst 24 s at 20 |
| 369M **random-weight** `m369_random.ctern` (145 MB) | 4 | 1 | 9 MB | 168 MB | 3.5 | 55 | 0.60 s | 2.2 s |
| 369M random | 4 | 5 | | 183 MB | 3.6 | 67 | 4.2 / 7.7 s | 5.5 / 8.9 s |
| 369M random | 4 | 20 | | 191 MB | 3.6 | 67 | 18.2 / 33.8 s | 19.5 / 35.3 s |

Next.js app process: about 101 MB RSS. Build output (`.next`) is 20 MB; `node_modules` is 251 MB.

**Measured vs. projected for the real 369M:** the 369M rows use the random-weight file of the 369M architecture. Speed and memory depend on architecture, not on weight values, so they should carry over closely to the trained 369M. I haven't verified that because the trained model isn't out yet. Answer **quality** of the 369M is unknown; rerun `npm run testset -- cipher-369M` when it lands.

**Reading the 20-guests row:** 20 guests sending an open-ended question in the same second is a stress case. Fact questions don't queue at all. If it ever matters, the fixes are: lower `max_tokens` to around 60-80 (shorter answers), run 2+ cipher-serve processes behind a small round-robin, or add batching to cipher-serve.

## Option A: on-prem Cipher box per hotel (Jim's original plan)
Jim first wanted one box per hotel, but hardware cost made it unrealistic. With Cipher's footprint that changes. **The whole stack needs about 300 MB of RAM measured with the 369M-size file (191 MB peak cipher-serve plus 101 MB Next.js), and 4 CPU cores to run at full speed.** A 2 GB board has room to spare.

**ARM build:** cipher-serve cross-compiles cleanly for aarch64 (`aarch64-linux-gnu-gcc -O3 -mcpu=cortex-a76`, which enables the NEON + dotprod path; a `-static` build also works). It ran under `qemu-aarch64 -cpu max` and produced **byte-identical output** to the x86 build at temperature 0 on the same prompt. qemu reported 22.7 tok/s, but **qemu emulation speed says nothing about real Pi 5 performance**. Real ARM throughput is **not measured**; the first step should be one real board. Build commands are in "Building for ARM" below.

### Hardware options (public list prices; check before buying)
| Option | What you get | List price (USD) | Source |
|---|---|---|---|
| Raspberry Pi 5, 2 GB | 4x Cortex-A76 @ 2.4 GHz, Gigabit Ethernet | **$65** (held at that price in the Apr 2026 increase) | https://www.raspberrypi.com/news/a-new-3gb-raspberry-pi-4-for-83-75-and-more-memory-driven-price-increases/ ; table at https://liliputing.com/raspberry-pis-ramageddon-response-includes-a-3gb-raspberry-pi-4-84-and-by-raising-the-16gb-raspberry-pi-5-price-to-305/ |
| Raspberry Pi 5, 4 GB | same, more headroom | **$110** (after the Apr 2026 +$25) | same sources |
| Raspberry Pi 5, 8 GB | not needed for this app | $175 | same sources |
| Official 27W USB-C PSU | required for the Pi 5 | $12.95 (US reseller PiShop) | https://www.pishop.us/product/raspberry-pi-27w-usb-c-power-supply-black-us/ |
| Official Pi 5 case with fan | active cooling under sustained load | $10.95 (PiShop) | https://www.pishop.us/product-category/raspberry-pi/?page=19 |
| microSD with Pi OS, 32 GB | boot media (an SSD is better for 24/7) | $19.95 (PiShop) | same PiShop page |
| x86 N100 mini PC | 4-core x86, AVX2 build like this box | **not priced**: the official Beelink page I found showed an implausible $1,259 and a 404, so I didn't use it | n/a |

**Pi 5 2 GB box BOM: $65 + $12.95 + $10.95 + $19.95 ≈ $109 per hotel** before tax and shipping. Not included: a UPS, a spare unit, shipping, and on-site setup time.

### Per-hotel cost vs. a cloud server
| | On-prem Pi 5 (2 GB) per hotel | Cipher CTS VPS shared by many hotels |
|---|---|---|
| Up-front | ≈ $109 per hotel (BOM above) | $0 |
| Monthly | Electricity only (Pi 5 is about 12 W at worst-case peak per Raspberry Pi; real draw not measured) | Hetzner CX33 (4 vCPU / 8 GB, EU): $9.99/mo + IPv4. CAX21 (4 ARM vCPU / 8 GB, EU): $12.49/mo. Hetzner US cheapest shared plan with 4 vCPU wasn't listed in the June 2026 table; US CPX21 (3 vCPU) is $37.49/mo. Source: https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/ (excl. VAT and IPv4) |
| Hotels per unit | 1 | Several, since facts answers barely use CPU and only open questions queue. The exact number isn't measured; load-test with real traffic |
| Privacy story | Strongest: guest questions never leave the property | Guest questions go to a Cipher CTS server (no third parties, no logging), not "never leaves the building" |
| Reachability | Guests on hotel Wi-Fi reach it directly; guests on cellular need a tunnel or reverse proxy (another hop) | Reachable from anywhere over HTTPS |
| Ops | Physical install, remote updates, SD/SSD wear, hotel IT/firewall approval, one box to fail per hotel | One place to update, monitor and back up |
| Payback | Pi BOM ≈ 9-11 months of a ~$10-12/mo VPS, if one VPS serves one hotel. If a VPS serves many hotels, cloud is cheaper per hotel | |

### Recommendation
- **GM demos now:** one small Cipher CTS-run VPS (e.g. a 4 vCPU / 8 GB plan) running cipher-serve plus the app, with access logs off or minimized. A US location would give US guests lower latency. Demo links reach it from any phone. This needs an account and a card, so Jim has to sign off; I haven't created anything.
- **Pilot:** buy one Pi 5 (2 GB or 4 GB) to measure real ARM tok/s and power draw before promising on-prem. If real throughput on 4 cores is reasonable, on-prem per hotel becomes a ~$110 hardware line item. That's a strong fit for "Zero Data Extraction".
- Either way: HTTPS (Caddy or nginx with Let's Encrypt), a systemd unit for each process, and the VPS provider's own logging understood and documented.

## Building for ARM (aarch64)
```bash
sudo apt-get install gcc-aarch64-linux-gnu qemu-user libc6-dev-arm64-cross
cd Cipher_bot/native/cipher-serve
aarch64-linux-gnu-gcc -O3 -mcpu=cortex-a76 -std=c11 -ffp-contract=off -o cipher-serve-arm64 serve.c runtime/cipher.c -lm -lpthread
# correctness only (emulated, NOT representative of speed):
qemu-aarch64 -cpu max -L /usr/aarch64-linux-gnu ./cipher-serve-arm64 --model sft.ctern --port 8898
```
On a real Pi you can also just run `make` there.

## Logging and privacy checklist for any host
- The app never logs message content (no `console.log` in the chat path; errors return generic text).
- cipher-serve's stderr logs **only stats** (prompt/gen token counts, ttft, tok/s), never content. Confirmed in serve.c.
- Reverse proxy: disable access logs or strip query strings (the room token is in `?t=`). Don't log request bodies.
- Next.js telemetry is disabled in every npm script (`NEXT_TELEMETRY_DISABLED=1`).
