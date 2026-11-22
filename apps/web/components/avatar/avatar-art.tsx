// Avatar de Quiz_Rush: personaje original dibujado en SVG por capas (marco, capa trasera,
// cuerpo, ropa, ojos, boca y sombrero). Sin imágenes externas: escala a cualquier tamaño.
import { useId, type ReactNode } from 'react';
import { normalizeAvatar, type AvatarConfig } from '@quiz-rush/shared';
import { cn } from '@/lib/utils';

const INK = '#1a1640';

/** Aclara (amt > 0) u oscurece (amt < 0) un color hexadecimal. */
function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => {
    const v = (n >> shift) & 255;
    return Math.round(amt > 0 ? v + (255 - v) * amt : v * (1 + amt));
  };
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

function Body({ kind, color }: { kind: AvatarConfig['body']; color: string }) {
  const stroke = shade(color, -0.35);
  const p = { fill: color, stroke, strokeWidth: 3, strokeLinejoin: 'round' as const };
  const shine = (
    <ellipse
      cx="44"
      cy="50"
      rx="9"
      ry="6"
      fill="#fff"
      opacity="0.35"
      transform="rotate(-25 44 50)"
    />
  );
  switch (kind) {
    case 'bean':
      return (
        <g>
          <rect x="32" y="30" width="56" height="78" rx="28" {...p} />
          {shine}
        </g>
      );
    case 'ghost':
      return (
        <g>
          <path
            d="M30 108 V62 a30 30 0 0 1 60 0 V108 l-10 -8 l-10 8 l-10 -8 l-10 8 l-10 -8 Z"
            {...p}
          />
          {shine}
        </g>
      );
    case 'cube':
      return (
        <g>
          <rect x="27" y="34" width="66" height="70" rx="12" {...p} />
          <path d="M27 50 h66" stroke={stroke} strokeWidth="2" opacity="0.4" />
          {shine}
        </g>
      );
    case 'robot':
      return (
        <g>
          <line x1="60" y1="18" x2="60" y2="32" stroke={stroke} strokeWidth="3" />
          <circle cx="60" cy="16" r="5" fill="#ff3d9a" stroke={stroke} strokeWidth="2" />
          <rect x="18" y="58" width="10" height="20" rx="4" {...p} />
          <rect x="92" y="58" width="10" height="20" rx="4" {...p} />
          <rect x="28" y="32" width="64" height="74" rx="14" {...p} />
          <rect x="44" y="88" width="32" height="10" rx="3" fill={shade(color, -0.2)} />
          {shine}
        </g>
      );
    case 'star':
      return (
        <g>
          <path
            d="M60 22 L71 47 L98 49 L77 67 L84 94 L60 80 L36 94 L43 67 L22 49 L49 47 Z"
            {...p}
            strokeWidth="6"
          />
          {shine}
        </g>
      );
    case 'dragon':
      return (
        <g>
          <path
            d="M26 64 L8 48 L14 72 Z M94 64 L112 48 L106 72 Z"
            fill={shade(color, -0.15)}
            stroke={stroke}
            strokeWidth="2"
          />
          <path
            d="M40 34 L44 18 L52 32 Z M80 34 L76 18 L68 32 Z"
            fill="#ffe14d"
            stroke={stroke}
            strokeWidth="2"
          />
          <path
            d="M28 70 a32 34 0 0 1 64 0 v18 a22 20 0 0 1 -22 20 h-20 a22 20 0 0 1 -22 -20 Z"
            {...p}
          />
          <path d="M48 104 q12 -8 24 0" fill="none" stroke={stroke} strokeWidth="2" />
          {[44, 56, 68].map((y) => (
            <path key={y} d={`M60 ${y - 6} l4 6 l-4 6 l-4 -6 Z`} fill={shade(color, 0.3)} />
          ))}
          {shine}
        </g>
      );
    default:
      // blob
      return (
        <g>
          <path
            d="M60 28 C86 28 98 46 98 68 C98 92 82 108 60 108 C38 108 22 92 22 68 C22 46 34 28 60 28 Z"
            {...p}
          />
          {shine}
        </g>
      );
  }
}

function Eyes({ kind }: { kind: AvatarConfig['eyes'] }) {
  const L = 48;
  const R = 72;
  const y = 60;
  const round = (cx: number) => (
    <g key={cx}>
      <circle cx={cx} cy={y} r="7" fill="#fff" stroke={INK} strokeWidth="2" />
      <circle cx={cx + 1.5} cy={y + 1} r="3.5" fill={INK} />
    </g>
  );
  const arc = (cx: number) => (
    <path
      key={cx}
      d={`M${cx - 6} ${y + 2} q6 -8 12 0`}
      fill="none"
      stroke={INK}
      strokeWidth="3.5"
      strokeLinecap="round"
    />
  );
  switch (kind) {
    case 'round':
      return <>{[L, R].map(round)}</>;
    case 'sleepy':
      return (
        <>
          {[L, R].map((cx) => (
            <path
              key={cx}
              d={`M${cx - 6} ${y} q6 5 12 0`}
              fill="none"
              stroke={INK}
              strokeWidth="3.5"
              strokeLinecap="round"
            />
          ))}
        </>
      );
    case 'wink':
      return (
        <>
          {round(L)}
          {arc(R)}
        </>
      );
    case 'cool':
      return (
        <g>
          <rect x="36" y="53" width="22" height="13" rx="5" fill={INK} />
          <rect x="62" y="53" width="22" height="13" rx="5" fill={INK} />
          <path d="M58 58 h4" stroke={INK} strokeWidth="3" />
          <path d="M40 57 l6 0" stroke="#fff" strokeWidth="2" opacity="0.7" />
        </g>
      );
    case 'stars':
      return (
        <>
          {[L, R].map((cx) => (
            <path
              key={cx}
              d={`M${cx} ${y - 8} l2.4 5 5.6 .8 -4 3.9 1 5.5 -5 -2.6 -5 2.6 1 -5.5 -4 -3.9 5.6 -.8 Z`}
              fill="#ffe14d"
              stroke={INK}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          ))}
        </>
      );
    case 'hearts':
      return (
        <>
          {[L, R].map((cx) => (
            <path
              key={cx}
              d={`M${cx} ${y + 6} l-7 -7 a4 4 0 0 1 7 -5 a4 4 0 0 1 7 5 Z`}
              fill="#ff3d9a"
              stroke={INK}
              strokeWidth="1.5"
            />
          ))}
        </>
      );
    default:
      return <>{[L, R].map(arc)}</>;
  }
}

function Mouth({ kind }: { kind: AvatarConfig['mouth'] }) {
  const s = { fill: 'none', stroke: INK, strokeWidth: 3.5, strokeLinecap: 'round' as const };
  switch (kind) {
    case 'open':
      return (
        <path
          d="M50 76 q10 14 20 0 Z"
          fill={INK}
          stroke={INK}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      );
    case 'neutral':
      return <path d="M52 80 h16" {...s} />;
    case 'tongue':
      return (
        <g>
          <path d="M50 77 q10 10 20 0" {...s} />
          <path d="M57 82 q3 8 6 0" fill="#ff6b9a" stroke={INK} strokeWidth="2" />
        </g>
      );
    case 'fangs':
      return (
        <g>
          <path d="M50 77 q10 10 20 0" {...s} />
          <path
            d="M53 79 l2 5 l2 -4 Z M63 80 l2 4 l2 -5 Z"
            fill="#fff"
            stroke={INK}
            strokeWidth="1.2"
          />
        </g>
      );
    case 'grin':
      return (
        <g>
          <rect
            x="47"
            y="74"
            width="26"
            height="11"
            rx="5"
            fill="#fff"
            stroke={INK}
            strokeWidth="2.5"
          />
          <path d="M53 74 v11 M60 74 v11 M67 74 v11" stroke={INK} strokeWidth="1.5" />
        </g>
      );
    default:
      return <path d="M50 77 q10 10 20 0" {...s} />;
  }
}

function Hat({ kind }: { kind: AvatarConfig['hat'] }) {
  switch (kind) {
    case 'cap':
      return (
        <g>
          <path d="M34 36 a26 18 0 0 1 52 0 Z" fill="#e5484d" stroke={INK} strokeWidth="2.5" />
          <path
            d="M60 36 h34 a4 4 0 0 1 0 6 h-34 Z"
            fill="#c62f36"
            stroke={INK}
            strokeWidth="2.5"
          />
          <circle cx="60" cy="19" r="3" fill="#fff" />
        </g>
      );
    case 'party':
      return (
        <g>
          <path
            d="M60 2 L76 34 H44 Z"
            fill="#a78bfa"
            stroke={INK}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path d="M52 18 l14 6 M48 27 l20 4" stroke="#ffe14d" strokeWidth="3" />
          <circle cx="60" cy="3" r="4" fill="#ffe14d" stroke={INK} strokeWidth="2" />
        </g>
      );
    case 'flower':
      return (
        <g transform="translate(80 30)">
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse
              key={a}
              cx="0"
              cy="-7"
              rx="5"
              ry="8"
              fill="#f472b6"
              stroke={INK}
              strokeWidth="1.5"
              transform={`rotate(${a})`}
            />
          ))}
          <circle r="4.5" fill="#ffe14d" stroke={INK} strokeWidth="1.5" />
        </g>
      );
    case 'headphones':
      return (
        <g>
          <path
            d="M26 64 a34 36 0 0 1 68 0"
            fill="none"
            stroke={INK}
            strokeWidth="6"
            strokeLinecap="round"
          />
          <rect
            x="16"
            y="56"
            width="14"
            height="22"
            rx="6"
            fill="#22d3ee"
            stroke={INK}
            strokeWidth="2.5"
          />
          <rect
            x="90"
            y="56"
            width="14"
            height="22"
            rx="6"
            fill="#22d3ee"
            stroke={INK}
            strokeWidth="2.5"
          />
        </g>
      );
    case 'horns':
      return (
        <g fill="#f5f5f4" stroke={INK} strokeWidth="2.5" strokeLinejoin="round">
          <path d="M38 38 q-14 -10 -10 -28 q8 14 20 20 Z" />
          <path d="M82 38 q14 -10 10 -28 q-8 14 -20 20 Z" />
        </g>
      );
    case 'wizard':
      return (
        <g>
          <path
            d="M60 -6 L84 34 H36 Z"
            fill="#4f46e5"
            stroke={INK}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <ellipse cx="60" cy="34" rx="30" ry="6" fill="#4338ca" stroke={INK} strokeWidth="2.5" />
          <path
            d="M60 10 l2 4 4.5 .6 -3.2 3.1 .8 4.4 -4.1 -2.1 -4 2.1 .8 -4.4 -3.3 -3.1 4.5 -.6 Z"
            fill="#ffe14d"
          />
        </g>
      );
    case 'halo':
      return (
        <ellipse cx="60" cy="16" rx="22" ry="6" fill="none" stroke="#ffe14d" strokeWidth="5" />
      );
    case 'crown':
      return (
        <g>
          <path
            d="M38 36 L40 14 L50 26 L60 10 L70 26 L80 14 L82 36 Z"
            fill="#ffd23f"
            stroke={INK}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <circle cx="60" cy="28" r="3.5" fill="#e5484d" />
          <circle cx="47" cy="31" r="2.5" fill="#22d3ee" />
          <circle cx="73" cy="31" r="2.5" fill="#22d3ee" />
        </g>
      );
    case 'laurel':
      return (
        <g fill="#a3e635" stroke={INK} strokeWidth="1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i}>
              <ellipse
                cx={36 + i * 5}
                cy={40 - i * 4}
                rx="4"
                ry="7"
                transform={`rotate(${-50 + i * 12} ${36 + i * 5} ${40 - i * 4})`}
              />
              <ellipse
                cx={84 - i * 5}
                cy={40 - i * 4}
                rx="4"
                ry="7"
                transform={`rotate(${50 - i * 12} ${84 - i * 5} ${40 - i * 4})`}
              />
            </g>
          ))}
        </g>
      );
    default:
      return null;
  }
}

/** Ropa delante del cuerpo (la capa va detrás: ver Back). */
function Outfit({ kind }: { kind: AvatarConfig['outfit'] }) {
  switch (kind) {
    case 'bowtie':
      return (
        <g>
          <path
            d="M48 92 L60 98 L48 104 Z M72 92 L60 98 L72 104 Z"
            fill="#e5484d"
            stroke={INK}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <circle cx="60" cy="98" r="3" fill="#c62f36" stroke={INK} strokeWidth="1.5" />
        </g>
      );
    case 'scarf':
      return (
        <g>
          <path
            d="M34 88 q26 12 52 0 v8 q-26 12 -52 0 Z"
            fill="#fb923c"
            stroke={INK}
            strokeWidth="2"
          />
          <path d="M72 96 l6 16 l8 -3 l-6 -15 Z" fill="#fb923c" stroke={INK} strokeWidth="2" />
        </g>
      );
    case 'hoodie':
      return (
        <g>
          <path d="M30 92 q30 18 60 0 L94 112 H26 Z" fill="#475569" stroke={INK} strokeWidth="2" />
          <path d="M52 100 v8 M68 100 v8" stroke="#f5f5f4" strokeWidth="2" strokeLinecap="round" />
        </g>
      );
    case 'medal':
      return (
        <g>
          <path d="M52 84 L60 98 L68 84" fill="none" stroke="#22d3ee" strokeWidth="4" />
          <circle cx="60" cy="102" r="7" fill="#ffd23f" stroke={INK} strokeWidth="2" />
          <text x="60" y="105" textAnchor="middle" fontSize="8" fontWeight="900" fill={INK}>
            1
          </text>
        </g>
      );
    case 'spacesuit':
      return (
        <g>
          <circle
            cx="60"
            cy="66"
            r="44"
            fill="#bae6fd"
            opacity="0.25"
            stroke="#e0f2fe"
            strokeWidth="3"
          />
          <path
            d="M34 34 a40 40 0 0 1 18 -10"
            fill="none"
            stroke="#fff"
            strokeWidth="4"
            strokeLinecap="round"
            opacity="0.8"
          />
          <rect
            x="44"
            y="96"
            width="32"
            height="12"
            rx="4"
            fill="#f5f5f4"
            stroke={INK}
            strokeWidth="2"
          />
          <circle cx="52" cy="102" r="2" fill="#e5484d" />
          <circle cx="60" cy="102" r="2" fill="#a3e635" />
        </g>
      );
    default:
      return null;
  }
}

/** Capas detrás del cuerpo (la capa). */
function Back({ outfit }: { outfit: AvatarConfig['outfit'] }) {
  if (outfit !== 'cape') return null;
  return (
    <path
      d="M30 80 L14 116 H106 L90 80 Z"
      fill="#e5484d"
      stroke={INK}
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
  );
}

function Frame({ kind, id }: { kind: AvatarConfig['frame']; id: string }) {
  const ring = (stroke: string, width = 5, extra: ReactNode = null) => (
    <g>
      <circle cx="60" cy="60" r="56" fill="none" stroke={stroke} strokeWidth={width} />
      {extra}
    </g>
  );
  switch (kind) {
    case 'simple':
      return ring('#ffffff', 4);
    case 'neon':
      return (
        <g>
          <circle
            cx="60"
            cy="60"
            r="56"
            fill="none"
            stroke="#22d3ee"
            strokeWidth="8"
            opacity="0.35"
          />
          {ring('#67e8f9', 3)}
        </g>
      );
    case 'gold':
      return (
        <g>
          <defs>
            <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff3b0" />
              <stop offset="0.5" stopColor="#ffd23f" />
              <stop offset="1" stopColor="#b8860b" />
            </linearGradient>
          </defs>
          {ring(`url(#${id}-gold)`, 7)}
        </g>
      );
    case 'rainbow':
      return (
        <g>
          <defs>
            <linearGradient id={`${id}-rb`} x1="0" y1="0" x2="1" y2="1">
              {['#e5484d', '#fb923c', '#ffe14d', '#a3e635', '#22d3ee', '#a78bfa'].map((c, i) => (
                <stop key={c} offset={i / 5} stopColor={c} />
              ))}
            </linearGradient>
          </defs>
          {ring(`url(#${id}-rb)`, 7)}
        </g>
      );
    case 'flames':
      return (
        <g>
          {Array.from({ length: 12 }, (_, i) => (
            <path
              key={i}
              d="M60 2 q6 8 0 14 q-6 -6 0 -14 Z"
              fill={i % 2 ? '#fb923c' : '#e5484d'}
              transform={`rotate(${i * 30} 60 60)`}
            />
          ))}
          {ring('#fb923c', 4)}
        </g>
      );
    case 'season1':
      return ring(
        '#a78bfa',
        6,
        [0, 90, 180, 270].map((a) => (
          <path
            key={a}
            d="M60 0 l2.5 5 5.5 .8 -4 3.9 1 5.5 -5 -2.6 -5 2.6 1 -5.5 -4 -3.9 5.5 -.8 Z"
            fill="#ffe14d"
            stroke={INK}
            strokeWidth="1"
            transform={`rotate(${a} 60 60)`}
          />
        )),
      );
    default:
      return null;
  }
}

export function AvatarArt({
  config,
  size = 48,
  className,
  title,
  background = true,
}: {
  config: unknown;
  size?: number;
  className?: string;
  /** Texto alternativo (si se omite, es decorativo) */
  title?: string;
  background?: boolean;
}) {
  const c = normalizeAvatar(config);
  const id = useId().replace(/:/g, '');
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={cn('shrink-0 overflow-visible', className)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {background && <circle cx="60" cy="60" r="56" fill={shade(c.color, 0.75)} opacity="0.35" />}
      <Frame kind={c.frame} id={id} />
      <Back outfit={c.outfit} />
      <Body kind={c.body} color={c.color} />
      <Outfit kind={c.outfit === 'spacesuit' ? 'none' : c.outfit} />
      <Eyes kind={c.eyes} />
      <Mouth kind={c.mouth} />
      <Hat kind={c.hat} />
      {c.outfit === 'spacesuit' && <Outfit kind="spacesuit" />}
    </svg>
  );
}
