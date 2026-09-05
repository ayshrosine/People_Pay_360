'use client';

import * as React from 'react';

/**
 * The animated lattice behind the sign-in screen.
 *
 * An isometric grid of hairlines with nodes that drift in and out of glow. It
 * is drawn as one SVG rather than a canvas so it stays crisp at any density and
 * costs nothing to render; the only animation is opacity on a few dozen
 * circles, which the compositor handles without touching layout.
 *
 * Purely decorative: hidden from assistive technology, and it holds still for
 * anyone who has asked for reduced motion.
 */

const WIDTH = 1600;
const HEIGHT = 900;
const SPACING = 54;
const ROW_HEIGHT = SPACING * 0.866; // equilateral triangle height

/**
 * A deterministic hash in [0, 1).
 *
 * Integer maths only, on purpose. `Math.sin` and friends are
 * implementation-defined in ECMAScript, so Node and the browser can disagree in
 * the last bits - which renders different values on the server and the client
 * and trips a hydration mismatch. `Math.imul` is exact everywhere.
 */
function hash(x: number, y: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 13), 0x297a2d39);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

interface Node {
  x: number;
  y: number;
  r: number;
  delay: string;
  duration: string;
  bright: boolean;
}

interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function buildLattice() {
  const columns = Math.ceil(WIDTH / SPACING) + 2;
  const rows = Math.ceil(HEIGHT / ROW_HEIGHT) + 2;

  const nodes: Node[] = [];
  const lines: Line[] = [];

  for (let row = 0; row < rows; row += 1) {
    // Every other row is offset by half a cell, which is what turns a square
    // grid into the triangular lattice.
    const offset = row % 2 === 0 ? 0 : SPACING / 2;
    const y = Math.round(row * ROW_HEIGHT);

    for (let column = 0; column < columns; column += 1) {
      const x = column * SPACING + offset;
      const rand = hash(column, row);

      // Density climbs towards the bottom: the lattice grows up from the lower
      // edge rather than tiling the whole viewport evenly.
      const depth = y / HEIGHT;
      if (rand > 0.06 + depth * depth * 0.95) continue;

      const shade = hash(column + 977, row + 311);

      nodes.push({
        x,
        y,
        r: shade < 0.14 ? 4 : shade < 0.45 ? 3 : 2.2,
        delay: (shade * 6).toFixed(2),
        duration: (3.5 + rand * 5).toFixed(2),
        bright: shade < 0.14,
      });

      // Each node draws its right and two lower diagonals, so every edge in the
      // lattice is emitted exactly once.
      lines.push({ x1: x, y1: y, x2: x + SPACING, y2: y });
      lines.push({ x1: x, y1: y, x2: x + SPACING / 2, y2: Math.round(y + ROW_HEIGHT) });
      lines.push({ x1: x, y1: y, x2: x - SPACING / 2, y2: Math.round(y + ROW_HEIGHT) });
    }
  }

  return { nodes, lines };
}

export function LatticeBackground() {
  // The lattice is constant, so build it once per mount.
  const { nodes, lines } = React.useMemo(() => buildLattice(), []);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* A deep wash, so the lattice reads as depth rather than wallpaper. */}
      <div className="absolute inset-0 bg-[radial-gradient(130%_95%_at_50%_-15%,var(--lattice-wash-top),transparent_60%),radial-gradient(110%_75%_at_50%_120%,var(--lattice-wash-bottom),transparent_65%)]" />

      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMidYMax slice"
        focusable="false"
      >
        <defs>
          {/* Fades the whole field out towards the top, so the lattice never
              collides with the brand mark or the top of the card. */}
          <linearGradient id="lattice-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="35%" stopColor="white" stopOpacity="0.35" />
            <stop offset="100%" stopColor="white" stopOpacity="1" />
          </linearGradient>
          <mask id="lattice-mask">
            <rect width={WIDTH} height={HEIGHT} fill="url(#lattice-fade)" />
          </mask>
          <filter id="lattice-glow" x="-300%" y="-300%" width="700%" height="700%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g mask="url(#lattice-mask)">
          <g stroke="var(--lattice-line)" strokeWidth="1">
            {lines.map((line, index) => (
              <line key={index} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
            ))}
          </g>

          <g filter="url(#lattice-glow)">
            {nodes.map((node, index) => (
              <circle
                key={index}
                cx={node.x}
                cy={node.y}
                r={node.r}
                fill={node.bright ? 'var(--lattice-node-bright)' : 'var(--lattice-node)'}
                className="lattice-node"
                style={{ animationDelay: `${node.delay}s`, animationDuration: `${node.duration}s` }}
              />
            ))}
          </g>
        </g>
      </svg>
    </div>
  );
}
