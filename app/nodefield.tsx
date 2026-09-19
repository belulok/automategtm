/**
 * The converging field behind the hero: thin lines fanning in from both edges
 * toward the input, with nodes travelling along them.
 *
 * Geometry is derived from the index, never random, so the server and client
 * render identical markup. Motion uses CSS offset-path rather than SMIL so
 * prefers-reduced-motion can switch it off in one rule.
 */
const LINES = 13;
const VW = 1000;
const VH = 600;
const MID_Y = VH / 2;
/** Where the two funnels stop: roughly the left and right edges of the input. */
const LEFT_FOCUS = 360;
const RIGHT_FOCUS = VW - LEFT_FOCUS;

function buildPath(i: number, side: 'l' | 'r'): string {
  const t = i / (LINES - 1);
  // Bias the spread toward the middle so the funnel reads as a funnel.
  const spread = Math.sin((t - 0.5) * Math.PI) * 0.5 + 0.5;
  const edgeY = 8 + spread * (VH - 16);
  const focus = side === 'l' ? LEFT_FOCUS : RIGHT_FOCUS;
  const edgeX = side === 'l' ? 0 : VW;
  const dir = side === 'l' ? 1 : -1;

  // Long flat control near the edge, then a gentle pull to the focus point.
  const c1x = edgeX + dir * 200;
  const c1y = edgeY;
  const c2x = focus - dir * 130;
  const c2y = MID_Y + (edgeY - MID_Y) * 0.18;
  return `M ${edgeX},${edgeY} C ${c1x},${c1y} ${c2x},${c2y} ${focus},${MID_Y}`;
}

type Node = { d: string; delay: number; dur: number; size: number; accent: boolean };

function buildNodes(): Node[] {
  const out: Node[] = [];
  for (const side of ['l', 'r'] as const) {
    for (let i = 0; i < LINES; i++) {
      const d = buildPath(i, side);
      // One or two travellers per line, offset so they never move in lockstep.
      const count = i % 3 === 0 ? 2 : 1;
      for (let n = 0; n < count; n++) {
        const seed = i * 7 + n * 13 + (side === 'l' ? 0 : 3);
        out.push({
          d,
          dur: 9 + (seed % 7),
          delay: -((seed * 1.7) % 12),
          size: seed % 5 === 0 ? 4 : 3,
          accent: seed % 6 === 0,
        });
      }
    }
  }
  return out;
}

const PATHS = (['l', 'r'] as const).flatMap((side) =>
  Array.from({ length: LINES }, (_, i) => buildPath(i, side)),
);
const NODES = buildNodes();

export function NodeField() {
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${VW} ${VH}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute left-1/2 top-1/2 h-[min(140vh,760px)] w-screen max-w-none -translate-x-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500"
    >
      <g className="opacity-40 dark:opacity-30">
        {PATHS.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth={0.7} />
        ))}
      </g>
      <g>
        {NODES.map((n, i) => (
          <rect
            key={i}
            // Offset by half so the square rides centred on the path; SVG rects
            // have no offset-anchor support worth relying on.
            x={-n.size / 2}
            y={-n.size / 2}
            width={n.size}
            height={n.size}
            rx={0.5}
            className={`node-travel ${n.accent ? 'fill-emerald-500/70' : 'fill-current opacity-45'}`}
            style={{
              offsetPath: `path("${n.d}")`,
              offsetRotate: '0deg',
              animationDuration: `${n.dur}s`,
              animationDelay: `${n.delay}s`,
            }}
          />
        ))}
      </g>
    </svg>
  );
}
