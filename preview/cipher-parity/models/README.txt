Overlay these files here before a generation test. Do not commit them.

models/sft.ctern
  bytes 73231828
  sha256 4f97a2162fd96b899c4bb0398cc288239f2b1963627dca5fcbe1afc02dd51e55
  live small Concierge model

models/cipher2m_concierge_targeted.ctern
  bytes 144672788
  sha256 13790c5a9d76d9ce226181d75840bfbb92e32ab1fa66722975ef401f5571c1d6
  targeted 369M after hotel SFT. Open general.html. Do not use this file on general-sftv3.html.

models/sft_v3.ctern
  bytes 144672788
  sha256 bc95f7455f60d2d85e16aa5abc4e1c01ccbadd4e1bdfe5881a7430de539f6bcb
  pre-finetune SFTv3, before hotel SFT. Open general-sftv3.html. Same architecture, not a smaller model, not the targeted checkpoint.

The page refuses generation until the selected file’s size and sha256 match.
