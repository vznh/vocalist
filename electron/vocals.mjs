import { access, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { run } from './process.mjs';

const stemFolder = 'voice-mix-v1';
export const stemPath = (track, stem) => path.join(track.directory, stemFolder, `${stem}.m4a`);
export async function hasVoiceMix(track) {
  if (!track.audioPath || !track.directory) return false;
  try { await Promise.all(['vocals', 'instrumental'].map(stem => access(stemPath(track, stem)))); return true; }
  catch { return false; }
}

export async function separateVoiceMix(track, settings, signal) {
  if (await hasVoiceMix(track)) return;
  const temporary = await mkdtemp(path.join(track.directory, '.voice-mix-'));
  const output = path.join(temporary, 'ready');
  try {
    await run('uvx', ['demucs-mlx==1.6.1', '-n', 'htdemucs', '--seed', '0', '-o', temporary, track.audioPath],
      { signal, timeout: 900_000, env: { SSL_CERT_FILE: process.env.SSL_CERT_FILE || '/etc/ssl/cert.pem' } });
    const separated = path.join(temporary, path.parse(track.audioPath).name);
    await mkdir(output);
    const args = ['-nostdin', '-loglevel', 'error', '-y'];
    await run(settings.ffmpeg, [...args, '-i', path.join(separated, 'vocals.wav'), '-c:a', 'aac', '-b:a', '256k', path.join(output, 'vocals.m4a')], { signal });
    await run(settings.ffmpeg, [...args, ...['drums', 'bass', 'other'].flatMap(stem => ['-i', path.join(separated, `${stem}.wav`)]),
      '-filter_complex', 'amix=inputs=3:normalize=0', '-c:a', 'aac', '-b:a', '256k', path.join(output, 'instrumental.m4a')], { signal });
    signal.throwIfAborted();
    await rename(output, path.join(track.directory, stemFolder));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
