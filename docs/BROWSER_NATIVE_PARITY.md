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

## How to look

`/lab/parity` is 404 unless `CIPHER_PARITY_LAB=1`. It prints the fact path or the exact system prompt for the 12 browser questions and lets a pasted draft be judged. It does not load weights.
