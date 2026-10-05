// Animated hero scenes — one per industry family.
//
// These are what make a generated site look designed rather than templated, so
// they are real illustrations with moving parts, not floating icons: a crane
// that slews and hoists, a truck whose wheels turn, bubbles that rise and sway.
//
// Rules that keep them safe on every tenant site:
//   - deterministic (no randomness) so server and client markup match
//   - pure transform/opacity, driven by CSS classes in globals.css
//   - all motion stops under prefers-reduced-motion (one rule in globals.css)
//   - drawn in white/brand alpha, so they work on any palette
//   - decorative: aria-hidden, never carries information

import type { SceneKind } from "@/lib/industries";

const WRAP = "ws-scene pointer-events-none absolute inset-0 overflow-hidden";

interface V {
  v: number;
}

export default function HeroScene({ kind, variant = 0 }: { kind: SceneKind; variant?: number }) {
  const Scene = SCENES[kind] ?? SCENES.craft;
  // Without this every gym in town runs the identical animation with only the
  // colours swapped. The variant reshapes the composition — where things sit,
  // how many there are, which way they move — so two businesses in one trade
  // read as two different designs.
  const v = Math.abs(Math.floor(variant));
  return (
    <div className={WRAP} aria-hidden="true">
      <Glow v={v} />
      <Scene v={v} />
      <Sweep />
    </div>
  );
}

/**
 * Pick this business's option from a list.
 *
 * Every property keeps its own list, and the lists are deliberately different
 * lengths — 3, 4, 5, 7 — so one seed lands on a different combination for each
 * rather than every property moving in lockstep.
 */
function at<T>(options: readonly T[], v: number): T {
  return options[v % options.length];
}

/** Deterministic spread of n items across a band — no two variants alike. */
function spread(n: number, startPct: number, stepPct: number): number[] {
  return Array.from({ length: n }, (_, i) => startPct + i * stepPct);
}

/** Soft breathing light blobs — depth on every scene. */
function Glow({ v }: V) {
  const a = at(["-right-24 -top-28 h-80 w-80", "-left-16 -top-32 h-96 w-96", "right-1/3 -top-40 h-72 w-72", "-right-32 top-1/4 h-64 w-64", "left-1/4 -top-24 h-96 w-96"], v);
  const b = at(["-bottom-32 left-1/4 h-72 w-72", "-bottom-24 right-1/5 h-80 w-80", "-bottom-40 left-1/2 h-64 w-64", "-bottom-28 -left-10 h-80 w-80", "bottom-1/4 right-1/3 h-56 w-56", "-bottom-36 left-2/3 h-72 w-72", "-bottom-20 right-1/2 h-64 w-64"], v);
  return (
    <>
      <span className={`ws-glow absolute rounded-full bg-white/10 blur-3xl ${a}`} />
      <span
        className={`ws-glow absolute rounded-full bg-[var(--brand-accent)]/20 blur-3xl ${b}`}
        style={{ animationDelay: "3.5s" }}
      />
    </>
  );
}

/** A slow band of light crossing the hero, like the reference sites. */
function Sweep() {
  return <span className="ws-sweep absolute inset-y-0 -left-1/3 w-1/3" />;
}

/* ------------------------------------------------------------------ drive */
/* Transport, travel, automotive: a truck rolling along a road, wheels turning,
   roadside poles and clouds passing at different speeds (parallax). */
function Drive({ v }: V) {
  // Variant 1 sends the traffic the other way; the rest change the pace and
  // how busy the roadside is.
  const back = v % 2 === 1;
  const poles = at([3, 4, 2, 5, 6], v);
  const speed = at(["13s", "16s", "11s", "18s", "9.5s", "14.5s", "21s"], v);
  return (
    <>
      <Clouds v={v} />
      <div className="absolute inset-x-0 bottom-0 h-24">
        <div className="absolute inset-x-0 bottom-9 h-px bg-white/15" />
        <div className="ws-road absolute inset-x-0 bottom-[22px] h-[3px]" />
        {/* roadside poles, passing faster than the clouds */}
        {Array.from({ length: poles }, (_, i) => i).map((i) => (
          <span
            key={i}
            className="ws-pass absolute bottom-6 h-10 w-[2px] bg-white/10"
            style={{ left: "-10%", animationDelay: `${(i * 2.6).toFixed(1)}s`, animationDuration: at(["7.8s", "9.4s", "6.5s", "11s"], v) }}
          />
        ))}
        <div
          className="ws-drive absolute bottom-[26px] left-0"
          style={{ animationDuration: speed, ...(back ? { animationDirection: "reverse" } : {}) }}
        >
          <svg width="120" height="58" viewBox="0 0 120 58" fill="none" style={back ? { transform: "scaleX(-1)" } : undefined}>
            <path d="M4 40V16h52v24H4Z" fill="currentColor" className="text-white/85" />
            <path d="M58 40V24h24l12 10v6H58Z" fill="currentColor" className="text-[var(--brand-accent)]" />
            <path d="M62 27h16l8 7H62v-7Z" className="fill-white/35" />
            <path d="M4 40h112" stroke="currentColor" strokeWidth="2" className="text-white/25" />
            <g className="ws-wheel" style={{ transformOrigin: "26px 44px" }}>
              <circle cx="26" cy="44" r="9" className="fill-[#1c1917]" />
              <circle cx="26" cy="44" r="4" className="fill-white/70" />
              <path d="M26 36v16M18 44h16" stroke="currentColor" strokeWidth="1.5" className="text-white/40" />
            </g>
            <g className="ws-wheel" style={{ transformOrigin: "88px 44px" }}>
              <circle cx="88" cy="44" r="9" className="fill-[#1c1917]" />
              <circle cx="88" cy="44" r="4" className="fill-white/70" />
              <path d="M88 36v16M80 44h16" stroke="currentColor" strokeWidth="1.5" className="text-white/40" />
            </g>
          </svg>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ build */
/* Construction, building materials, interiors: a tower crane that slews, with a
   hoist cable raising a load, a wall building itself up, and drifting dust. */
function Build({ v }: V) {
  const courses = at([4, 5, 3, 6, 2], v);
  const place = at(["bottom-0 right-4", "bottom-0 left-4", "bottom-0 right-1/4", "bottom-0 left-1/5", "bottom-0 right-1/3"], v);
  const flip = v % 3 === 1;
  return (
    <>
      <Dust v={v} />
      <svg
        className={`absolute hidden h-[78%] w-[46%] md:block ${place}`}
        style={flip ? { transform: "scaleX(-1)" } : undefined}
        viewBox="0 0 320 260"
        fill="none"
        preserveAspectRatio="xMaxYMax meet"
      >
        {/* mast */}
        <path d="M150 250V60" stroke="currentColor" strokeWidth="4" className="text-white/30" />
        <path d="M142 250V60h16v190" stroke="currentColor" strokeWidth="2" className="text-white/15" />
        {[...Array(7)].map((_, i) => (
          <path
            key={i}
            d={`M142 ${72 + i * 26}l16 18M158 ${72 + i * 26}l-16 18`}
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-white/15"
          />
        ))}
        {/* jib + counterweight slew together */}
        <g className="ws-slew" style={{ transformOrigin: "150px 60px" }}>
          <path d="M62 58h196" stroke="currentColor" strokeWidth="5" className="text-[var(--brand-accent)]" />
          <path d="M150 34 78 56M150 34l96 22" stroke="currentColor" strokeWidth="2" className="text-white/30" />
          <path d="M150 34V58" stroke="currentColor" strokeWidth="3" className="text-white/30" />
          <rect x="62" y="50" width="22" height="16" rx="2" className="fill-white/35" />
          <g className="ws-trolley">
            <path d="M198 58v26" stroke="currentColor" strokeWidth="2" className="text-white/45" />
            <g className="ws-hoist">
              <rect x="186" y="84" width="24" height="18" rx="2" className="fill-white/80" />
            </g>
          </g>
        </g>
        {/* wall courses rising */}
        {Array.from({ length: courses }, (_, row) => row).map((row) => (
          <g key={row} className="ws-course" style={{ animationDelay: `${(row * 0.9).toFixed(1)}s` }}>
            {[0, 1, 2, 3].map((col) => (
              <rect
                key={col}
                x={34 + col * 26 + (row % 2 ? 13 : 0)}
                y={236 - row * 16}
                width="22"
                height="12"
                rx="1.5"
                className="fill-white/25"
              />
            ))}
          </g>
        ))}
      </svg>
    </>
  );
}

function Dust({ v }: V) {
  return (
    <>
      {Array.from({ length: at([5, 4, 6, 3, 7], v) }, (_, i) => i).map((i) => (
        <span
          key={i}
          className="ws-dust absolute bottom-0 h-16 w-16 rounded-full bg-white/10 blur-xl"
          style={{ left: `${at([12, 18, 15, 9], v) + i * at([18, 15, 20, 13], v)}%`, animationDelay: `${(i * 2.2).toFixed(1)}s` }}
        />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ water */
/* Beverages: layered waves heaving at different speeds, bubbles rising and
   swaying, and a droplet that falls and ripples. */
function Water({ v }: V) {
  const bubbles = at([6, 8, 5, 9, 7, 4], v);
  const waveSpeed = at(["11s", "9s", "14s", "16s", "12.5s", "8s", "19s"], v);
  const dropLeft = at(["72%", "38%", "60%", "25%", "84%", "48%", "66%"], v);
  return (
    <>
      {Array.from({ length: bubbles }, (_, i) => i).map((i) => (
        <span
          key={i}
          className="ws-bubble absolute rounded-full border border-white/40 bg-white/10"
          style={{
            left: `${at([10, 6, 8, 12], v) + i * at([15, 11, 13, 9], v)}%`,
            width: 10 + (i % 3) * 8,
            height: 10 + (i % 3) * 8,
            animationDelay: `${(i * 1.7).toFixed(1)}s`,
            animationDuration: `${11 + (i % 3) * 2}s`,
          }}
        />
      ))}
      <span className="ws-droplet absolute top-0 h-3 w-3 rounded-full bg-white/60" style={{ left: dropLeft }} />
      <span
        className="ws-ripple absolute bottom-16 h-8 w-8 rounded-full border border-white/40"
        style={{ left: `calc(${dropLeft} - 2%)` }}
      />
      <svg
        className="ws-wave absolute bottom-0 left-0 h-28 w-[200%]"
        style={{ animationDuration: waveSpeed }}
        viewBox="0 0 1440 110"
        preserveAspectRatio="none"
      >
        <path d="M0,55 C180,95 360,15 540,55 C720,95 900,15 1080,55 C1260,95 1440,15 1440,55 L1440,110 L0,110Z" className="fill-white/10" />
      </svg>
      <svg
        className="ws-wave absolute bottom-0 left-0 h-20 w-[200%]"
        style={{ animationDuration: "15s", animationDirection: "reverse" }}
        viewBox="0 0 1440 110"
        preserveAspectRatio="none"
      >
        <path d="M0,65 C240,25 480,105 720,65 C960,25 1200,105 1440,65 L1440,110 L0,110Z" className="fill-white/15" />
      </svg>
    </>
  );
}

/* ------------------------------------------------------------------- care */
/* Clinics, dental, salon, gym: a heartbeat line that draws itself, expanding
   pulse rings and softly rising motes. */
const ECG = [
  "M0 60h380l24-34 26 68 30-86 26 52h92l22-26 24 26h576",
  "M0 60h240l18-28 22 56 26-74 22 46h120l20-30 22 30h140l16-22 18 22h536",
  "M0 60h460l20-40 24 80 28-96 24 56h74l26-20 22 20h522",
];

function Care({ v }: V) {
  const rings = at(["76%", "30%", "58%", "22%", "68%", "44%", "86%"], v);
  const motes = at([5, 6, 4, 7, 3], v);
  return (
    <>
      <svg className="absolute inset-x-0 top-1/2 h-24 w-full -translate-y-1/2" viewBox="0 0 1200 120" fill="none" preserveAspectRatio="none">
        <path
          d={at(ECG, v)}
          stroke="currentColor"
          strokeWidth="2.5"
          className="ws-trace text-white/35"
        />
      </svg>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="ws-ring absolute top-1/2 h-24 w-24 rounded-full border border-white/30"
          style={{ left: rings, animationDelay: `${(i * 1.6).toFixed(1)}s` }}
        />
      ))}
      {spread(motes, at([14, 10, 12, 16], v), at([17, 19, 22, 15], v)).map((left, i) => (
        <span
          key={i}
          className="ws-mote absolute bottom-0 rounded-full bg-white/25"
          style={{ left: `${left}%`, width: 6 + (i % 3) * 4, height: 6 + (i % 3) * 4, animationDelay: `${(i * 2.4).toFixed(1)}s` }}
        />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------- tech */
/* IT, consulting, education, property, manufacturing: a grid with nodes that
   light up in sequence and a dot travelling the connecting path. */
const NODE_SETS = [
  [[18, 30], [38, 62], [60, 26], [78, 58], [52, 78]],
  [[24, 20], [46, 48], [30, 74], [68, 36], [84, 66]],
  [[14, 52], [40, 24], [58, 70], [76, 30], [88, 56]],
];
const NODE_PATHS = [
  "M18 30 38 62 60 26 78 58 52 78",
  "M24 20 46 48 30 74 68 36 84 66",
  "M14 52 40 24 58 70 76 30 88 56",
];

function Tech({ v }: V) {
  const nodes = at(NODE_SETS, v);
  return (
    <>
      <div className="ws-grid absolute inset-0 opacity-[0.18]" />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" fill="none">
        <path
          d={at(NODE_PATHS, v)}
          stroke="currentColor"
          strokeWidth="0.4"
          className="ws-trace text-white/40"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {nodes.map(([x, y], i) => (
        <span
          key={i}
          className="ws-node absolute h-2.5 w-2.5 rounded-full bg-[var(--brand-accent)]"
          style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${(i * 0.7).toFixed(1)}s` }}
        />
      ))}
      {spread(at([3, 4, 2], v), at([26, 18, 22, 30], v), at([24, 28, 30, 21], v)).map((left, i) => (
        <span
          key={i}
          className="ws-mote absolute bottom-0 rounded-full bg-white/20"
          style={{ left: `${left}%`, width: 5, height: 5, animationDelay: `${i * 3}s` }}
        />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ craft */
/* Food, events, retail, hotels, farms: warm drifting motes, a shimmer arc and
   slow-turning rays — celebratory without being literal. */
function Craft({ v }: V) {
  const rays = at([12, 16, 9, 20, 14, 7], v);
  const place = at(["-right-16 -top-16 h-72 w-72", "-left-20 -top-20 h-80 w-80", "right-1/4 -top-24 h-64 w-64", "-right-24 top-1/3 h-64 w-64", "left-1/3 -top-28 h-80 w-80"], v);
  return (
    <>
      <svg className={`ws-rays absolute opacity-25 ${place}`} viewBox="0 0 100 100" fill="none">
        {Array.from({ length: rays }, (_, i) => i).map((i) => (
          <path
            key={i}
            d="M50 50 L50 2"
            stroke="currentColor"
            strokeWidth="2"
            className="text-white"
            transform={`rotate(${((i * 360) / rays).toFixed(1)} 50 50)`}
          />
        ))}
      </svg>
      {spread(at([7, 6, 8, 5, 9], v), at([8, 6, 10, 7], v), at([13, 16, 11, 14], v)).map((left, i) => (
        <span
          key={i}
          className="ws-mote absolute bottom-0 rounded-full bg-white/30"
          style={{
            left: `${left}%`,
            width: 5 + (i % 3) * 5,
            height: 5 + (i % 3) * 5,
            animationDelay: `${(i * 1.6).toFixed(1)}s`,
            animationDuration: `${12 + (i % 4) * 2}s`,
          }}
        />
      ))}
      {spread(at([3, 4, 2], v), at([62, 54, 58, 66], v), at([11, 13, 9], v)).map((left, i) => (
        <span
          key={i}
          className="ws-twinkle absolute h-1.5 w-1.5 rounded-full bg-white"
          style={{ left: `${left}%`, top: `${22 + i * 16}%`, animationDelay: `${(i * 1.3).toFixed(1)}s` }}
        />
      ))}
    </>
  );
}

function Clouds({ v }: V) {
  return (
    <>
      {Array.from({ length: at([3, 2, 4, 5], v) }, (_, i) => i).map((i) => (
        <span
          key={i}
          className="ws-pass absolute h-10 w-28 rounded-full bg-white/10 blur-md"
          style={{ top: `${14 + i * 13}%`, left: "-20%", animationDelay: `${i * 7}s`, animationDuration: `${26 + i * 6}s` }}
        />
      ))}
    </>
  );
}

const SCENES: Record<SceneKind, (p: V) => React.ReactElement> = {
  drive: Drive,
  build: Build,
  water: Water,
  care: Care,
  tech: Tech,
  craft: Craft,
};
