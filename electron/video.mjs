import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, copyFile, rename, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { drawKaraoke, DEFAULT_FONT, VIDEO_WIDTH, VIDEO_HEIGHT } from '../shared/karaoke.mjs';
import { validateLines, validateFont } from './timing.mjs';
import { toLrc, toSrt } from '../shared/lyrics-export.mjs';

const SYSTEM_FONTS = { Arial: 'Arial.ttf', Verdana: 'Verdana.ttf', 'Trebuchet MS': 'Trebuchet MS.ttf' };
// The house face is a trial install, so try both the static cut and the variable file.
const FONT_FALLBACKS = { 'ABC Schengen A Trial': ['ABCSchengenATrial-Regular.otf', 'ABCSchengenVariableTrial.ttf'] };

export const EXPORT_FORMATS = {
  mp4: { ext: 'mp4', label: 'MP4 video', video: ['-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-profile:v', 'high'], audio: ['-c:a', 'aac', '-profile:a', 'aac_low', '-ar', '48000', '-ac', '2', '-b:a', '384k'], mux: ['-avoid_negative_ts', 'disabled', '-use_editlist', '0', '-movflags', '+faststart+negative_cts_offsets'] },
  webm: { ext: 'webm', label: 'WebM video', video: ['-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-row-mt', '1'], audio: ['-c:a', 'libopus', '-b:a', '192k', '-ar', '48000', '-ac', '2'], mux: [] },
  gif: { ext: 'gif', label: 'Animated GIF', video: ['-c:v', 'gif'], audio: null, mux: ['-loop', '0'] },
  lrc: { ext: 'lrc', label: 'LRC lyrics' },
  srt: { ext: 'srt', label: 'SRT subtitles' },
};

export async function exportLyrics(track, output, format, shift = 0) {
  validateLines(track.result?.lines, track.duration, { requireTiming: true });
  const text = format === 'lrc' ? toLrc(track.result.lines, { title: track.title, artist: track.artist, shift }) : toSrt(track.result.lines, { shift });
  await writeFile(output, text);
  return output;
}

// Preview and export share one mapping so the rendered MP4 matches the room.
export const lyricsPosition = (frameTime, sync = 0) => Math.max(0, frameTime - (Number.isFinite(sync) ? sync : 0));

export async function exportVideo(track, output, settings, signal, progress = () => {}, { width = VIDEO_WIDTH, height = VIDEO_HEIGHT, fps = 30, mode = 'karaoke', format = 'mp4', sync = 0 } = {}) {
  signal?.throwIfAborted();
  if (format === 'lrc' || format === 'srt') return exportLyrics(track, output, format, sync);
  const preset = EXPORT_FORMATS[format];
  if (!preset) throw new Error(`Unsupported export format: ${format}`);
  validateLines(track.result?.lines, track.duration, { requireTiming: true });
  const font = validateFont(track.font || settings.font || DEFAULT_FONT);
  const fontFiles = [...(FONT_FALLBACKS[font] || []), SYSTEM_FONTS[font]].filter(Boolean);
  for (const directory of [path.join(homedir(), 'Library/Fonts'), '/Library/Fonts', '/System/Library/Fonts', '/System/Library/Fonts/Supplemental']) {
    for (const file of fontFiles) {
      if (GlobalFonts.has(font)) break;
      try { GlobalFonts.registerFromPath(path.join(directory, file), font); } catch {}
    }
    if (GlobalFonts.has(font)) break;
  }
  let resolved = font;
  if (!GlobalFonts.has(resolved)) {
    // An unavailable house face must not block an export that already has valid timing.
    resolved = 'Arial';
    for (const directory of ['/System/Library/Fonts/Supplemental', '/System/Library/Fonts']) {
      if (GlobalFonts.has(resolved)) break;
      try { GlobalFonts.registerFromPath(path.join(directory, 'Arial.ttf'), resolved); } catch {}
    }
  }
  if (!GlobalFonts.has(resolved)) throw new Error(`${font} is not installed. Install it or choose another font before exporting.`);
  const silent = !preset.audio;
  if (!silent) await access(track.audioPath);
  const canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
  ctx.scale(width / VIDEO_WIDTH, height / VIDEO_HEIGHT);
  const artwork = track.artwork?.startsWith('data:image/jpeg;base64,')
    ? await loadImage(Buffer.from(track.artwork.slice('data:image/jpeg;base64,'.length), 'base64')).catch(() => undefined)
    : undefined;
  // Encode in session storage first. A cancelled render never damages an existing file.
  const temporary = path.join(track.directory, `render-${randomUUID()}.${preset.ext}`);
  if ([temporary, track.audioPath].some(file => path.resolve(file) === path.resolve(output))) throw new Error('Choose an export destination outside the song’s working files.');
  const pendingOutput = path.join(path.dirname(output), `.norae-export-${randomUUID()}.${preset.ext}`);
  const videoFilters = format === 'gif' ? ['-vf', `fps=12,scale=960:-2:flags=lanczos`, '-loop', '0'] : ['-vf', 'scale=out_color_matrix=bt709:out_range=tv,setsar=1,setparams=field_mode=prog:range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709'];
  const videoColor = format === 'gif' ? [] : ['-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv'];
  const videoTuning = format === 'mp4' ? ['-bf', '2', '-g', String(Math.max(1, Math.round(fps / 2))), '-x264-params', 'open-gop=0'] : [];
  const audioArgs = preset.audio || [];
  const child = spawn(settings.ffmpeg, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', `${width}x${height}`, '-framerate', String(fps), '-i', 'pipe:0',
    ...(silent ? [] : ['-i', track.audioPath]),
    ...(silent ? [] : ['-map', '0:v:0', '-map', '1:a:0']),
    ...videoFilters, ...preset.video, ...videoTuning, ...videoColor, ...audioArgs,
    '-t', String(track.duration), ...preset.mux, temporary,
  ], { shell: false, stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true, env: { PATH: `${process.env.PATH || ''}:/opt/homebrew/bin:/usr/local/bin` } });
  let stderr = '', failure;
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
  child.stdin.on('error', error => { failure ||= error; });
  const finished = new Promise((resolve, reject) => {
    child.once('error', error => { failure = error; reject(error); });
    child.once('close', code => code === 0 && !failure ? resolve() : reject(failure || new Error(stderr || `FFmpeg exited with code ${code}.`)));
  });
  // Attach a rejection handler immediately while frame generation is in progress.
  void finished.catch(() => {});
  const abort = () => { child.stdin.destroy(); child.kill('SIGTERM'); };
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 3600000);
  let lastProgress = -1;
  try {
    signal?.throwIfAborted();
    const frames = Math.ceil(track.duration * fps);
    for (let frame = 0; frame < frames; frame++) {
      signal?.throwIfAborted();
      if (failure || child.exitCode !== null) throw failure || new Error(stderr || 'Video encoder stopped.');
      drawKaraoke(ctx, track.result.lines, lyricsPosition(frame / fps, sync), track.duration, { font: resolved, mode, copyright: track.lyrics?.copyright || '', artwork });
      const pixels = ctx.getImageData(0, 0, width, height).data;
      const bytes = Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength);
      if (!child.stdin.write(bytes)) await once(child.stdin, 'drain', { signal });
      const percent = Math.min(99, Math.floor((frame + 1) / frames * 100));
      if (percent !== lastProgress) { progress(percent); lastProgress = percent; }
      if (frame % 15 === 0) await new Promise(resolve => setImmediate(resolve));
    }
    child.stdin.end(); await finished; signal?.throwIfAborted();
    // Copy across volumes first, then commit atomically in the destination
    // directory. A copy failure or cancellation leaves an existing file intact.
    await copyFile(temporary, pendingOutput, constants.COPYFILE_EXCL);
    signal?.throwIfAborted();
    await rename(pendingOutput, output);
    progress(100);
    return output;
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
    if (child.exitCode === null) { abort(); const kill = setTimeout(() => child.kill('SIGKILL'), 2000); await finished.catch(() => {}); clearTimeout(kill); }
    await Promise.all([temporary, pendingOutput].map(file => rm(file, { force: true })));
  }
}

export async function saveTimingProject(track, output) {
  await writeFile(output, JSON.stringify({ version: 1, url: track.url || '', title: track.title, artist: track.artist, duration: track.duration, font: track.font || DEFAULT_FONT, source: track.result?.source, copyright: track.lyrics?.copyright || '', lines: track.result?.lines || [] }, null, 2));
  return output;
}
