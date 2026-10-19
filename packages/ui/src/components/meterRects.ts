import type { MeterSegment, MeterTone } from './MeterBar';

export interface MeterRect {
  readonly x: number;
  readonly width: number;
  readonly tone: MeterTone;
}

const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

/**
 * The parts of a bar on a 100-unit track: each is its fraction × 100 to one decimal; a part after
 * another starts 1 unit later, leaving a gap in the track colour; the whole is clipped at 100.
 */
export function meterRects(segments: readonly MeterSegment[]): MeterRect[] {
  const rects: MeterRect[] = [];
  let x = 0;
  for (const segment of segments) {
    const width = Math.round(clamp01(segment.fraction) * 1000) / 10;
    if (width <= 0) continue;
    const start = rects.length === 0 ? x : x + 1;
    if (start >= 100) break;
    const clipped = Math.min(width, 100 - start);
    rects.push({ x: start, width: clipped, tone: segment.tone });
    x = start + clipped;
  }
  return rects;
}
