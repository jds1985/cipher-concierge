import { Phone } from "./Icons";
// Tap-to-call when the hotel has a direct number; otherwise show the in-room instruction.
export default function CallButton({ frontDesk, compact = false, className = "" }) {
  if (frontDesk.phoneTel)
    return <a className={`call-btn ${className}`} href={`tel:${frontDesk.phoneTel}`} aria-label={`Call the front desk at ${frontDesk.phoneDisplay}`}><Phone />{compact ? "Front desk" : `Call front desk · ${frontDesk.phoneDisplay}`}</a>;
  return <span className={`call-btn ${className}`} role="note"><Phone />{compact ? "Dial 0" : frontDesk.inRoom}</span>;
}
