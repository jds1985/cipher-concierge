# General generation baseline (experimental, not ready to merge)

Guest hotel mode stays on `index.html`. This page is `general.html`.

`general.html` accepts only the after-hotel-SFT file:

`models/cipher2m_concierge_targeted.ctern`  
144672788 bytes  
sha256 `13790c5a9d76d9ce226181d75840bfbb92e32ab1fa66722975ef401f5571c1d6`

`general-sftv3.html` is the pre-finetune control. Same prompts, system text, settings, candidate worker, and two passes. It accepts only:

`models/sft_v3.ctern`  
144672788 bytes  
sha256 `bc95f7455f60d2d85e16aa5abc4e1c01ccbadd4e1bdfe5881a7430de539f6bcb`

That file is SFTv3 before the hotel SFT. It is not a smaller model and it is not labeled targeted. This machine did not have the file, so the hash was not recomputed here. The known train split is 192 train and 26 val.

Settings for every prompt: ctx 512, temp 0.3, repetition 1.15, topP 1, greedy false, seed 0, maxNew 128, reset before the system text. Ctx 512 is not native ctx 1024. maxNew 128 is wider than the guest cap of 64 so a short explanation is less likely to be cut off. A hit on 128 tokens is recorded as truncated.

The system string is exactly: `You are Cipher, a helpful assistant. Answer the user clearly and accurately. If you do not know, say so.`

No hotel router runs. Raw text is the result. Export does not replace it.

## Page startup

`general-v1.json` is loaded with `fetch`. A module import of that file fails in the browser because the server sends `application/json`. If startup throws, the status line says `Page failed to start` and export stays disabled. Export turns on only after the prompt file and the weight check have finished.

## What the worker actually sends

From `cipher-worker.js` (same bytes as `public/cipher/cipher-worker.js`):

- `setSystem` calls `_cw_begin(text, 1, 0)`
- `generate` calls `_cw_begin(text, 0, maxNew)`
- `raw` mode 2 is not used

`cipher-worker-candidate.js` is used only here. It rewrites RNG byte 2224 only when the wasm sha256 is `3220b68e…` or `a28bdc23…`. `tests/wasm-rng-slot.test.js` instantiated those exact files: seed 0 is stored there, and calling the sampler again with seed 0 does not keep seed 0. A zero-length piece stops the visible text and records its token id. That id is not claimed to be a special. `tok.special` in the `.ctern` was not read. The tokenizer file is not in this repo.

To verify the wrapper, the needed tree is `jds1985/Cipher_bot` branch `cipher-runtime`, the `cw_begin` implementation, plus the tokenizer cited as `/workspace/cipher2_final_eval/tokenizer.json`.

## Hypotheses, not causes

The targeted run was 80 steps on fictional hotel rows. A hotel-shaped answer on an open prompt is a training-mix hypothesis. The prior SFTv3 mix was described as math-heavy. Neither is proof, and parameter count is not claimed as the cause. The attached 24 hotel-button trials called the model only for the joke, so they do not measure this baseline.
