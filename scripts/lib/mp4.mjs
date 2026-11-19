import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createCanvas } from '@napi-rs/canvas';
import { drawKaraoke } from '../../shared/karaoke.mjs';
import { READING_BAR_OPACITY } from '../../shared/reading-cursor.mjs';
import { run } from '../../electron/process.mjs';

export const probe = async file => JSON.parse(await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]));

export async function decodedFrame(file, frame) {
  const child = spawn('ffmpeg', ['-nostdin', '-loglevel', 'error', '-i', file, '-vf', `select=eq(n\\,${frame})`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const buffers = []; let error = '';
  child.stdout.on('data', data => buffers.push(data)); child.stderr.on('data', data => { error += data; });
  await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => code === 0 ? resolve() : reject(new Error(error))); });
  const pixels = Buffer.concat(buffers); assert.equal(pixels.length, 1920 * 1080 * 3); return pixels;
}

export async function assertFastStart(output) {
  const file = await readFile(output), atoms = [];
  for (let offset = 0; offset + 8 <= file.length;) { const size = file.readUInt32BE(offset); assert.ok(size >= 8); atoms.push({ name: file.toString('ascii', offset + 4, offset + 8), offset, size }); offset += size; }
  const moov = atoms.find(atom => atom.name === 'moov'); assert.ok(moov.offset < atoms.find(atom => atom.name === 'mdat').offset);
  assert.equal(file.subarray(moov.offset, moov.offset + moov.size).includes(Buffer.from('elst')), false);
}

export async function assertEncodedFramesMatchPreview(output, lines, duration, positions) {
  const canvas = createCanvas(1920, 1080), ctx = canvas.getContext('2d');
  for (const position of positions) {
    drawKaraoke(ctx, lines, position, duration, { font: 'Arial' });
    const expected = ctx.getImageData(0, 0, 1920, 1080).data, actual = await decodedFrame(output, Math.round(position * 30));
    const coverPixel = (950 * 1920 + 1800) * 3;
    assert.ok(actual[coverPixel] > 210 && actual[coverPixel + 1] < 65 && actual[coverPixel + 2] < 80, 'Cover is visible in the lower right of the encoded frame');
    let white = 0, matchingWhite = 0, blue = 0, matchingBlue = 0;
    const barGray = Math.round(255 * READING_BAR_OPACITY);
    for (let pixel = 1920 * 280; pixel < 1920 * 850; pixel++) {
      const i = pixel * 4, j = pixel * 3;
      if (Math.abs(expected[i] - barGray) <= 1 && expected[i] === expected[i + 1] && expected[i] === expected[i + 2]) { white++; if ([0, 1, 2].every(channel => Math.abs(actual[j + channel] - expected[i + channel]) < 25)) matchingWhite++; }
      if (expected[i + 2] > 220 && expected[i] < 90 && expected[i + 1] > 105 && expected[i + 1] < 155) { blue++; if (actual[j + 2] > 200 && actual[j] < 110 && actual[j + 1] > 85 && actual[j + 1] < 175) matchingBlue++; }
    }
    assert.ok(white > 30 && matchingWhite / white > .65, `Reading bar differs from preview at ${position}s: ${matchingWhite}/${white} pixels`);
    if (position > 1) assert.ok(blue > 30 && matchingBlue / blue > .65, `Consumed words differ from preview at ${position}s`);
  }
}
