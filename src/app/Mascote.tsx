/** Motivo visual: cabeça de esfera branca sobre terno preto. */
export function Mascote({ size = 64, tie = '#d9953f' }: { size?: number; tie?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M8 64c0-14 10-22 24-22s24 8 24 22z" fill="#0a0a0c" />
      <path d="M32 42l-5 8 5 14 5-14z" fill={tie} />
      <path d="M26 42l6 6 6-6-6-3z" fill="#f4f4f0" />
      <circle cx="32" cy="22" r="17" fill="#f6f6f2" />
      <circle cx="26" cy="20" r="2.2" fill="#111" />
      <circle cx="38" cy="20" r="2.2" fill="#111" />
      <path d="M27 28q5 3 10 0" stroke="#111" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  );
}
