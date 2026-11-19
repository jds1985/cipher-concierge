# Isolated Cipher parity preview

Deploy this directory as a **new** Vercel preview. Do not replace these existing previews:

- https://cipher-wasm-test-i0rh67kaz-james-saenz-s-projects.vercel.app (`dpl_5inYSBhG2fULT1sBUt78hKZob7cA`)
- https://cipher-wasm-test-f2oxi02sh-james-saenz-s-projects.vercel.app (`dpl_H9XTnjKqn8zaLax86PGM9475N2kp`)

`vercel.json` in this folder sets COOP/COEP so the threaded WASM build can start. Production cipher-concierge is a different project.

## Overlay weights (not in this archive)

Copy onto the deployed root:

| Path | Bytes | sha256 |
|---|---|---|
| `models/sft.ctern` | 73231828 | `4f97a2162fd96b899c4bb0398cc288239f2b1963627dca5fcbe1afc02dd51e55` |
| `models/cipher2m_concierge_targeted.ctern` | 144672788 | `13790c5a9d76d9ce226181d75840bfbb92e32ab1fa66722975ef401f5571c1d6` |

Open `?model=sft` or `?model=targeted`. Both use ctx 512, temp 0.3, repetition 1.15, topP 1, seed 0, maxNew 64, and a reset before every model turn. That is not native ctx 1024.

Facts answer without the files. Generation stays disabled until the selected file’s size and sha256 match.
