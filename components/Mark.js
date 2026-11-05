export default function Mark({ size = 32, small = false, className = "" }) {
  return <img src={small ? "/brand/hex_circuit_small.svg" : "/brand/hex_circuit.svg"} width={size} height={size} alt="" aria-hidden="true" className={className} />;
}
