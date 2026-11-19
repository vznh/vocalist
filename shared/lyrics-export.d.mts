import type { LyricLine } from '../src/types';
export function toLrc(lines: LyricLine[], meta?: { title?: string; artist?: string }): string;
export function toSrt(lines: LyricLine[]): string;
