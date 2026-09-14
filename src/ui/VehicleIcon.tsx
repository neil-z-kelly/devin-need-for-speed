import type { VehicleKind } from '../state/settings';

/** Side-profile silhouettes for the garage selector, tinted with the player's paint. */
export function VehicleIcon({ kind, paint }: { kind: VehicleKind; paint: string }) {
  const common = { viewBox: '0 0 120 56', width: 120, height: 56, 'aria-hidden': true, className: 'vehicle-icon' } as const;
  if (kind === 'car') {
    return (
      <svg {...common}>
        <path d="M6 36 L14 22 Q40 10 68 14 L92 26 L110 30 Q116 32 114 38 L6 38 Z" fill={paint} />
        <path d="M30 22 L62 16 L84 26 Z" fill="#0b0d13" opacity="0.85" />
        <rect x="6" y="36" width="108" height="4" fill="#14161c" />
        <circle cx="30" cy="40" r="9" fill="#0b0d13" />
        <circle cx="30" cy="40" r="4" fill="#4a4f58" />
        <circle cx="90" cy="40" r="9" fill="#0b0d13" />
        <circle cx="90" cy="40" r="4" fill="#4a4f58" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M36 30 L52 16 L84 14 L96 22 L88 30 L74 34 L48 34 Z" fill={paint} />
      <path d="M84 14 L100 12 L104 18 L96 22 Z" fill="#9dbde0" opacity="0.7" />
      <path d="M50 16 L40 8 L46 6 L58 12 Z" fill="#14161c" />
      <path d="M60 12 L58 6 L64 4 L70 8 L68 14 Z" fill="#14161c" />
      <path d="M40 8 L34 12 L38 14 Z" fill="#14161c" />
      <line x1="96" y1="22" x2="104" y2="40" stroke="#c9a24a" strokeWidth="3" />
      <line x1="30" y1="40" x2="50" y2="32" stroke="#4a4f58" strokeWidth="4" />
      <circle cx="104" cy="40" r="11" fill="#0b0d13" />
      <circle cx="104" cy="40" r="5" fill="#4a4f58" />
      <circle cx="26" cy="40" r="11" fill="#0b0d13" />
      <circle cx="26" cy="40" r="5" fill="#4a4f58" />
    </svg>
  );
}
