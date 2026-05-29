/**
 * Stable color mapping for language chips and left-edge bars.
 * Hash the language name to pick from a fixed palette of HSL tokens.
 * All colors derive from semantic tokens or HSL values that work in light + dark mode.
 */

const PALETTE_HSL = [
  "hsl(217, 91%, 60%)",  // blue
  "hsl(142, 71%, 45%)",  // green
  "hsl(280, 67%, 60%)",  // purple
  "hsl(24, 95%, 58%)",   // orange
  "hsl(190, 85%, 50%)",  // cyan
  "hsl(340, 82%, 60%)",  // pink
  "hsl(45, 93%, 55%)",   // amber
  "hsl(160, 60%, 45%)",  // teal
  "hsl(258, 70%, 62%)",  // indigo
  "hsl(15, 75%, 55%)",   // rust
  "hsl(120, 50%, 45%)",  // forest
  "hsl(300, 60%, 55%)",  // magenta
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function getLanguageColor(name?: string | null): string {
  if (!name) return "hsl(var(--muted-foreground))";
  return PALETTE_HSL[hashString(name) % PALETTE_HSL.length];
}
