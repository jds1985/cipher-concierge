# General generation baseline (experimental, not ready to merge)

Guest hotel mode stays on `index.html`. This page is `general.html`.

Only the targeted file is loaded:

`models/cipher2m_concierge_targeted.ctern`  
144672788 bytes  
sha256 `13790c5a9d76d9ce226181d75840bfbb92e32ab1fa66722975ef401f5571c1d6`

Settings for every prompt: ctx 512, temp 0.3, repetition 1.15, topP 1, greedy false, seed 0, maxNew 128, reset before the system text. Ctx 512 is not native ctx 1024. maxNew 128 is wider than the guest cap of 64 so a short explanation is less likely to be cut off. A hit on 128 tokens is recorded as truncated.

The system string is exactly: `You are Cipher, a helpful assistant. Answer the user clearly and accurately. If you do not know, say so.`

No hotel router runs. Raw text is the result. Export does not replace it.

## What the worker actually sends

From `cipher-worker.js` (same bytes as `public/cipher/cipher-worker.js`):

- `setSystem` calls `_cw_begin(text, 1, 0)`
- `generate` calls `_cw_begin(text, 0, maxNew)`
- `raw` mode 2 is not used

`cipher-st.wasm` contains no readable chat-marker strings. An attached audit note, not re-checked against `tokenizer.json` because that file is not in this repo, says role ids are system=4, user=2, assistant=3, EOT=0, PAD=1. This page tokenizes the plain system and user strings and labels those ids as incomplete. It does not claim `setSystem` inserts role 4.

To verify the wrapper, the needed tree is `jds1985/Cipher_bot` branch `cipher-runtime`, the `cw_begin` implementation, plus the tokenizer cited as `/workspace/cipher2_final_eval/tokenizer.json`.

## Hypotheses, not causes

The targeted run was 80 steps on fictional hotel rows. A hotel-shaped answer on an open prompt is a training-mix hypothesis. The prior SFTv3 mix was described as math-heavy. Neither is proof, and parameter count is not claimed as the cause. The attached 24 hotel-button trials called the model only for the joke, so they do not measure this baseline.
