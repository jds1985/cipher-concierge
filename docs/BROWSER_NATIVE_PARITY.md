# Cipher browser vs native — coordinator report

Desktop evidence only. No model binary was rerun. No phone test. Production was not deployed or merged. The Liquid lab branch was left untouched.

## Root cause

The “checkout at noon” line was raw WASM text from the Nov 6 scratch preview, not a fact-pack answer and not a regression of the native 369M holdout.

Those two runs were not the same test:

| | Native holdout | Browser 12 |
|---|---|---|
| Questions | 20 × 2 hotels × 3 seeds | 12, one synthetic hotel |
| Hotel time | Marble Arch checkout field is the word `noon`. Silver Quill Inkwell is 10:30 AM. | Silver Quill Testville checkout is 11:00 AM. |
| Prompt | `buildPrompt` + retrieved facts, one turn (`cipher reply -s system -p user`) | System line only: “friendly concierge… Answer briefly.” No facts. |
| History | None | One conversation, no reset. Fact-pack replies were not inserted into the model. |
| Sampler | temp 0.3, rep 1.15, ctx 1024 | `greedy`, ctx 512, maxNew 64 |
| Filter | `guardAnswer` after trim | None. UI showed raw tokens. |
| Q7 router | Not in the native set | Scratch keywords (`checkout` / `check out` / `late check`) miss “When do I need to leave tomorrow morning?”, so the model was asked with no 11:00 AM in context. |

Production `route()` already maps that leave-paraphrase to checkout and returns 11:00 AM without calling a model. The scratch preview does not.

Native scoring also treats `noon` as correct when that hotel’s checkout fact is `noon`. It is not evidence the 369M model was asked the Testville 11:00 AM fact and contradicted it.

## Guard hole this fixes

`Check-out is at noon.` passed `guardAnswer` when the only time in the facts was `11:00 AM`, because `noon` has no digits. The same was true of “The front desk says leave at noon.” Clock words `noon`, `midnight`, and `midday` are now rejected unless that word is in the facts or the question (`unverified-time`). A fact that says `noon` still passes. `11:00 AM` still passes. `12:00 PM` against `11:00 AM` was already rejected as an unverified number.

## What was not rerun

Targeted weights `144672788` bytes, sha256 `13790c5a9d76d9ce226181d75840bfbb92e32ab1fa66722975ef401f5571c1d6`, and live small `73231828` bytes, sha256 `4f97a2162fd96b899c4bb0398cc288239f2b1963627dca5fcbe1afc02dd51e55`, were not in the bundle. No generation numbers were produced here.

To repeat a desktop generation on the isolated preview, place those two files on the preview origin (not by scraping the SSO preview) and point the existing phone loader at them. Do not send them through chat.

## Still open

- Larger vs smaller usefulness on jokes and open paraphrases was not remeasured.
- Compound questions still follow first matching intent. “wifi and checkout” does not answer both. That was not redesigned.
- The old static preview will keep saying noon until it uses this router, this prompt, a per-turn reset, and this guard.

## Static preview that can generate

`/opt/cursor/artifacts/cipher-parity-preview.zip` is a separate Vercel preview. It copies production `factpack.js` and the repo WASM. It does not contain weights.

Overlay `models/sft.ctern` (73,231,828 bytes, `4f97a216…`) and `models/cipher2m_concierge_targeted.ctern` (144,672,788 bytes, `13790c5a…`). Open `?model=sft` or `?model=targeted`. Both use ctx 512, temp 0.3, repetition 1.15, topP 1, seed 0, maxNew 64, and reset before every model turn. Ctx 512 is not native ctx 1024.

Generation stays off until the file size and sha256 match. Fact answers do not wait for weights. Each turn shows the system prompt, raw text, guard reason, and source. Do not deploy this over the existing dual or targeted-only previews.
