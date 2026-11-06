# Liquid browser lab — measured run

Started 2026-11-06T15:54:48.740Z · finished 2026-11-06T15:55:19.776Z

This is a desktop Chrome session. It is not a physical Android or iOS test.

## Already measured, not rerun

- WebGPU q4f16 session init succeeded in 23.3s. The first guest generation failed in 237 ms: `shader_helper.cc:416 Program Sub requires f16 but the device does not support it`. That was initialization plus a failed run, not a concierge answer. `shader-f16` was absent, so q4f16 was not a valid WebGPU path on this VM.
- WebGPU q4 warmup (float32 weights, asyncify runtime) was killed after 7 min 53 sec with no token. GPU process held about 329% CPU and 872 MB. The in-page timer cannot preempt that compile, so it was not started again.

## Blocker

model did not reach ready: Error: Can't create a session. ERROR_CODE: 9, ERROR_MESSAGE: Could not find an implementation for GatherBlockQuantized(1) node with name '/model/embed_tokens/Gather_Quant'
    at ze (http://127.0.0.1:3210/lab/vendor/transformers.min.js:15:31333)
    at pm (http://127.0.0.1:3210/lab/vendor/transformers.min.js:16:22185)
    at async uS.loadModel (http://127.0.0.1:3210/lab/vendor/transformers.min.js:16:35074)
    at async Jd.createInferenceSessionHandler (http://127.0.0.1:3210/lab/vendor/transformers.min.js:16:36795)
    at async RT.create (http://127.0.0.1:3210/lab/vendor/transformers.min.js:11:49080)
    at async iu (http://127.0.0.1:3210/lab/vendor/transformers.min.js:16:53598)
    at async http://127.0.0.1:3210/lab/vendor/transformers.min.js:40:18082
    at async Promise.all (index 0)
    at async cM (http://127.0.0.1:3210/lab/vendor/transformers.min.js:40:17939)
    at async Promise.all (index 0)

## Gate

```json
{
  "labStatusWhenOff": 404,
  "homeStatus": 200,
  "homeCspMatchesProduction": true,
  "homeCsp": "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "stayCsp": "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "stayCoep": "require-corp",
  "labStatusWithoutToken": 403,
  "labCsp": "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "invalidQrText": "Isolated lab. The live stay page is unchanged.\n\nPlease scan the QR code in your room\n\nThis link is not valid for Room 999. The model does not load until the room card checks out."
}
```

## Browser and load

```json
{
  "browser": {
    "chrome": "Chrome/156.0.8078.47"
  },
  "load": {
    "status": {
      "phase": "error",
      "text": "The on-phone model did not load. Hotel facts still answer here.",
      "device": "wasm",
      "dtype": "q4",
      "webgpu": {
        "ok": true,
        "info": {
          "isFallbackAdapter": false,
          "shaderF16": false
        },
        "shaderF16": false
      },
      "attempts": [
        {
          "device": "wasm",
          "dtype": "q4",
          "build": "asyncify",
          "ok": false,
          "ms": 23160,
          "error": "Error: Can't create a session. ERROR_CODE: 9, ERROR_MESSAGE: Could not find an implementation for GatherBlockQuantized(1) node with name '/model/embed_tokens/Gather_Quant'\n    at ze (http://127.0.0.1:3210/lab/vendor/transformers.min.js:15:31333)\n    at pm (http://127.0.0.1:3210/lab/vendor/transformers.min.js:16:22185)\n    at async uS.loadModel (http://127.0.0.1:3210/lab/vendor/transformers.min.js:16:35074)\n    at async Jd.createInferenceSessionHandler (http://127.0.0.1:3210/lab/vendor/transformers.min.js:16:36795)\n    at async RT.create (http://127.0.0.1:3210/lab/vendor/transformers.min.js:11:49080)\n    at async iu (http://127.0.0.1:3210/lab/vendor/transformers.min.js:16:53598)\n    at async http://127.0.0.1:3210/lab/vendor/transformers.min.js:40:18082\n    at async Promise.all (index 0)\n    at async cM (http://127.0.0.1:3210/lab/vendor/transformers.min.js:40:17939)\n    at async Promise.all (index 0)"
        }
      ],
      "loadMs": null,
      "files": {
        "config.json": {
          "loaded": 0,
          "total": 0,
          "status": "done"
        },
        "tokenizer.json": {
          "loaded": 0,
          "total": 0,
          "status": "done"
        },
        "tokenizer_config.json": {
          "loaded": 0,
          "total": 0,
          "status": "done"
        },
        "onnx/model_q4.onnx": {
          "loaded": 0,
          "total": 0,
          "status": "done"
        },
        "generation_config.json": {
          "loaded": 0,
          "total": 0,
          "status": "done"
        },
        "onnx/model_q4.onnx_data": {
          "loaded": 0,
          "total": 0,
          "status": "done"
        }
      },
      "error": "Error: Can't create a session. ERROR_CODE: 9, ERROR_MESSAGE: Could not find an implementation for GatherBlockQuantized(1) node with name '/model/embed_tokens/Gather_Quant'\n    at ze (http://127.0.0.1:3210/lab/vendor/transformers.min.js:15:31333)\n    at pm (http://127.0.0.1:3210/lab/vendor/transformers.min.js:16:22185)\n    at async uS.loadModel (http://127.0.0.1:3210/lab/vendor/transformers.min.js:16:35074)\n    at async Jd.createInferenceSessionHandler (http://127.0.0.1:3210/lab/vendor/transformers.min.js:16:36795)\n    at async RT.create (http://127.0.0.1:3210/lab/vendor/transformers.min.js:11:49080)\n    at async iu (http://127.0.0.1:3210/lab/vendor/transformers.min.js:16:53598)\n    at async http://127.0.0.1:3210/lab/vendor/transformers.min.js:40:18082\n    at async Promise.all (index 0)\n    at async cM (http://127.0.0.1:3210/lab/vendor/transformers.min.js:40:17939)\n    at async Promise.all (index 0)"
    },
    "ua": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.0.0 Safari/537.36",
    "deviceMemory": 16,
    "hardwareConcurrency": 4,
    "webgpu": true,
    "heap": {
      "used": 342006190,
      "total": 345638018,
      "limit": 4395630592
    },
    "assetRequestsBeforeQuestions": 18,
    "assetUrls": [
      "http://127.0.0.1:3210/lab/vendor/transformers.min.js",
      "http://127.0.0.1:3210/lab/models/LiquidAI/LFM2.5-350M-ONNX/onnx/model_q4f16.onnx",
      "http://127.0.0.1:3210/lab/models/LiquidAI/LFM2.5-350M-ONNX/onnx/model_q4.onnx",
      "http://127.0.0.1:3210/lab/models/LiquidAI/LFM2.5-350M-ONNX/config.json",
      "http://127.0.0.1:3210/lab/models/LiquidAI/LFM2.5-350M-ONNX/tokenizer_config.json",
      "http://127.0.0.1:3210/lab/models/LiquidAI/LFM2.5-350M-ONNX/onnx/model_q4.onnx_data",
      "http://127.0.0.1:3210/lab/models/LiquidAI/LFM2.5-350M-ONNX/generation_config.json",
      "http://127.0.0.1:3210/lab/models/LiquidAI/LFM2.5-350M-ONNX/tokenizer.json",
      "http://127.0.0.1:3210/lab/vendor/ort-wasm-simd-threaded.asyncify.wasm",
      "http://127.0.0.1:3210/lab/vendor/ort-wasm-simd-threaded.asyncify.mjs"
    ]
  },
  "memory": {
    "rssKbBefore": 1006620,
    "rssKbAtNav": 1182344,
    "rssKbAfterLoad": 1777220,
    "rssKbEnd": 1874888
  },
  "offline": {},
  "staff": {}
}
```

## Answers

| id | run | source | model | ms | resolution | desk | text |
|---|---|---|---|---|---|---|---|
| wifi | 1 | facts | no | 0 | full | no | Wi-Fi network: **Oliver-Guest**  No password needed. Join the network and accept the terms in your browser. |
| quiet | 1 | facts | no | 0 | full | no | Quiet hours are **10:00 PM to 8:00 AM daily**. |
| multi | 1 | facts | no | 0 | full | no | Checkout is at **11:00 AM**. Late checkout is available on request, based on availability. Ask the front desk.  Wi-Fi network: **Oliver-Guest**  No password needed. Join the network and accept the terms in your browser. |
| spa | 1 | facts | no | 0 | full | no | I don't have spa details on file for The Oliver Hotel, and I'd rather not guess. The front desk can help: Dial 0 from your room phone, or call **(865) 521-0050**. |
| emergency | 1 | facts | no | 0 | full | no | **If this is an emergency, call 911 now.** Then alert the front desk: Dial 0 from your room phone, or call **(865) 521-0050**. |
| open-blocked | 1 | waiting | no |  | blocked | no |  |

## Raw model drafts

## Cipher 135M baseline (recorded 2026-10-22 on-phone, not re-run)

The October phone run answered facts locally and called Cipher 135M only for open questions. Two of six open answers passed the guard. The hike question was a front-desk fallback (`cipher_unverified-number`), not a packing answer. The Spanish thank-you that passed the guard was not a translation.

- Oliver / What should I pack for a hike in the Smokies? → front desk fallback.
- Oliver / How do you say thank you in Spanish? → "I'm sorry for any confusion, but as a concierge... Cosífico de la cerca..."

## Privacy

Question leaks: 0. Foreign hosts during the whole session: []
