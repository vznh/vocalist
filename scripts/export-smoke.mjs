import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { QueueEngine } from '../electron/engine.mjs';
import { DEFAULT_SYNC } from '../shared/karaoke.mjs';
import { assertEncodedFramesMatchPreview, assertFastStart, decodedFrame, probe } from './lib/mp4.mjs';

const userData = await mkdtemp(path.join(os.tmpdir(), 'norae-export-desktop-'));
let app;
const line = (text, start, end, words = [{ text, start, end }]) => ({ text, start, end, words, blockStart: false, timing: 'manual', review: false, heard: '', agreement: null });
const lines = [
  line('Hold on', 1, 1.8, [{ text: 'Hold ', start: 1, end: 1.6 }, { text: 'on', start: 1.6, end: 1.8 }]),
  line('Yes', 1.85, 1.95), line('Sing', 2, 2.4), line('Here', 2.5, 3),
  { ...line('Go away', 3.1, 4, [{ text: 'Go ', start: 3.1, end: 3.3 }, { text: 'a', start: 3.3, end: 3.55 }, { text: 'way', start: 3.55, end: 4 }]), blockStart: true, section: 'Chorus' },
  line('Again', 4.3, 4.8),
];


try {
  const engine = await QueueEngine.open({ root: path.join(userData, 'library/audio'), persistencePath: path.join(userData, 'library/queue.json'), settings: {} });
  const id = await engine.demo(), track = engine.tracks[0];
  track.lyrics = { album: 'Test album' }; track.album = 'Test album'; track.releaseYear = 2026;
  track.duration = 6; track.result.lines = structuredClone(lines);
  track.result.lines[0].words[0].start = track.result.lines[0].words[0].end = null;
  await engine.close();
  const env = { ...process.env, NORAE_TEST_DATA: userData, NORAE_DEV_URL: '' }; delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: ['.'], env });
  const page = await app.firstWindow(), errors = []; page.on('pageerror', error => errors.push(error.message));
  const exportButton = page.getByRole('button', { name: 'Export', exact: true });
  await page.getByRole('heading', { name: 'A little louder', exact: true }).waitFor();
  assert.equal(await exportButton.isDisabled(), true);
  const byline = page.locator('.song-byline');
  assert.equal(await byline.locator('.song-artist').evaluate(el => getComputedStyle(el).opacity), '0.6');
  const lyricFontSize = await page.locator('.all-lyrics .lyric-line').first().evaluate(el => getComputedStyle(el).fontSize);
  assert.equal(await byline.getByRole('heading').evaluate(el => getComputedStyle(el).fontSize), lyricFontSize);
  assert.equal(await page.locator('.song-release').innerText(), 'Test album, 2026');
  await page.getByText(/Line 1, unit 1: set both start and end before exporting/).waitFor();
  const output = path.join(userData, 'export.mp4');
  const cover = path.join(userData, 'cover.png');
  const coverCanvas = createCanvas(32, 32);
  const coverCtx = coverCanvas.getContext('2d');
  coverCtx.fillStyle = '#ef2433'; coverCtx.fillRect(0, 0, 32, 32);
  await writeFile(cover, coverCanvas.toBuffer('image/png'));
  await app.evaluate(({ dialog }, { output, cover }) => {
    globalThis.providerCalls = 0; globalThis.fetch = async () => { globalThis.providerCalls++; throw new Error('Export must not call providers'); };
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: output });
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [cover] });
  }, { output, cover });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Add cover', exact: true }).click();
  await page.getByRole('button', { name: 'Change cover', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('canvas').getContext('2d').getImageData(1800, 950, 1, 1).data[0] > 220);
  const preview = page.getByRole('img', { name: 'Four-line karaoke video preview' });
  const assertFrameShape = async frame => {
    const { width, height } = await frame.boundingBox();
    assert.ok(Math.abs(width - height * 16 / 9) < 1, `Expected a 16:9 preview, got ${width}×${height}`);
  };
  await assertFrameShape(preview);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1040, 720));
  await page.waitForFunction(() => innerWidth === 1040);
  await assertFrameShape(preview);
  const roomFrame = await preview.evaluate(canvas => canvas.toDataURL());
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByRole('menuitemradio', { name: /Edit timing/ }).click();
  const editorFrame = page.getByRole('dialog', { name: 'Edit timing' }).getByRole('img');
  await editorFrame.waitFor();
  await assertFrameShape(editorFrame);
  await page.waitForFunction(expected => document.querySelector('[role="dialog"] canvas').toDataURL() === expected, roomFrame);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.evaluate(({ id, lines }) => window.norae.saveTiming(id, { lines, font: 'Arial', reviewed: true }), { id, lines });
  await exportButton.click();
  await page.getByRole('menuitemradio', { name: /MP4/ }).click();
  await page.getByRole('progressbar', { name: 'MP4 export progress' }).waitFor();
  await page.getByRole('status').filter({ hasText: 'Saved export.mp4' }).waitFor({ timeout: 120000 });
  const media = await probe(output);
  const video = media.streams.find(stream => stream.codec_type === 'video'), audio = media.streams.find(stream => stream.codec_type === 'audio');
  assert.equal(video.width, 1920); assert.equal(video.height, 1080); assert.equal(video.codec_name, 'h264'); assert.equal(video.profile, 'High');
  assert.equal(video.pix_fmt, 'yuv420p'); assert.equal(video.avg_frame_rate, '30/1'); assert.equal(video.nb_frames, '180'); assert.equal(video.sample_aspect_ratio, '1:1');
  assert.equal(video.color_space, 'bt709'); assert.equal(video.color_transfer, 'bt709'); assert.equal(video.color_primaries, 'bt709');
  assert.equal(audio.codec_name, 'aac'); assert.equal(audio.profile, 'LC'); assert.equal(audio.sample_rate, '48000'); assert.equal(audio.channels, 2);
  assert.ok(Math.abs(Number(media.format.duration) - 6) < .15);
  assert.ok(Math.abs(Number(video.start_time) - Number(audio.start_time)) < 1 / 30, `Audio/video starts must agree within a frame: video=${video.start_time}, audio=${audio.start_time}`);
  await assertFastStart(output);
  await assertEncodedFramesMatchPreview(output, lines, 6, [.5, 1.3, 2.2, 3.7], DEFAULT_SYNC);
  const mode = page.getByRole('button', { name: 'Mode', exact: true });
  await mode.click();
  await page.getByRole('menuitemradio', { name: 'Rolling', exact: true }).click();
  const scrolling = page.getByRole('img', { name: 'Rolling video preview' });
  await assertFrameShape(scrolling);
  const playback = page.getByRole('slider', { name: 'Playback position', exact: true });
  await playback.fill('2.2');
  const originalFrame = await scrolling.evaluate(canvas => canvas.toDataURL());
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByRole('menuitemradio', { name: /Edit timing/ }).click();
  const timing = page.getByRole('dialog', { name: 'Edit timing' });
  await timing.getByRole('combobox', { name: 'Lyric line', exact: true }).selectOption('2');
  await timing.getByText('Fine-tune numbers', { exact: true }).click();
  await timing.getByRole('spinbutton', { name: 'Start of unit 1', exact: true }).fill('2.3');
  await timing.getByRole('button', { name: 'Save timing', exact: true }).click();
  await timing.getByRole('status').filter({ hasText: 'Timing saved' }).waitFor();
  await timing.getByRole('button', { name: 'Close dialog', exact: true }).click();
  assert.notEqual(await scrolling.evaluate(canvas => canvas.toDataURL()), originalFrame);
  const scrollingOutput = path.join(userData, 'scrolling.mp4');
  await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, scrollingOutput);
  await exportButton.click();
  await page.getByRole('menuitemradio', { name: /MP4/ }).click();
  await page.getByRole('status').filter({ hasText: 'Saved scrolling.mp4' }).waitFor({ timeout: 120000 });
  const scrollingPixels = await decodedFrame(scrollingOutput, 66);
  const nearbyPixels = await scrolling.evaluate(canvas => Array.from(canvas.getContext('2d').getImageData(0, 0, 1, 1).data).slice(0, 3));
  assert.ok(nearbyPixels.every((channel, index) => Math.abs(scrollingPixels[index] - channel) < 8), 'Scrolling preview and exported background match');
  assert.ok(scrollingPixels[0] > 30, 'Export uses the scrolling mode instead of the black karaoke background');
  await mode.click();
  await page.getByRole('menuitemradio', { name: 'Karaoke', exact: true }).click();
  await preview.waitFor();
  assert.equal(await app.evaluate(() => globalThis.providerCalls), 0); assert.deepEqual(errors, []);
  assert.equal((await readdir(path.dirname(output))).some(file => file.startsWith('.norae-export-')), false);
  console.log('Export desktop passed: timing preflight, native progress, real 1080p/30 High H.264 + 48kHz stereo AAC, fast-start/no edit lists, audio/video sync, encoded bars and blue words match preview through lead-in and rolling pair replacement; no APIs or preview artifacts');
} finally { if (app) await app.close(); await rm(userData, { recursive: true, force: true }); }
