import { createCanvas, loadImage } from '@napi-rs/canvas';

export const COVER_SOURCE_LIMIT = 4 * 1024 * 1024;
const COVER_SIZE = 256;

export async function prepareArtwork(bytes) {
  if (!bytes.length || bytes.length > COVER_SOURCE_LIMIT) throw new Error('Choose an image smaller than 4 MB.');
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!jpeg && !png && !webp) throw new Error('Choose a JPEG, PNG, or WebP image.');
  const image = await loadImage(bytes);
  if (!image.width || !image.height) throw new Error('The cover image could not be opened.');
  const size = Math.min(image.width, image.height);
  const canvas = createCanvas(COVER_SIZE, COVER_SIZE);
  canvas.getContext('2d').drawImage(image, (image.width - size) / 2, (image.height - size) / 2, size, size, 0, 0, COVER_SIZE, COVER_SIZE);
  return canvas.toDataURL('image/jpeg', .84);
}

export async function sourceArtwork(url, signal) {
  if (typeof url !== 'string') return;
  try {
    const source = new URL(url);
    if (source.protocol !== 'https:' || source.port || source.username || source.password || !['i.ytimg.com', 'i1.sndcdn.com', 'img.youtube.com'].includes(source.hostname)) return;
    const response = await fetch(source, { redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(4000)]) });
    if (!response.ok || !response.body || !/^image\/(jpeg|png|webp)\b/i.test(response.headers.get('content-type') || '')) {
      await response.body?.cancel();
      return;
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > COVER_SOURCE_LIMIT) return;
      chunks.push(chunk);
    }
    return await prepareArtwork(Buffer.concat(chunks));
  } catch {
    // A missing thumbnail must not interrupt audio or lyrics processing.
  }
}
