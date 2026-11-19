import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { run } from './process.mjs';

const git = (project, args, options = {}) => run('git', ['-C', project, ...args], { timeout: 180_000, ...options });

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

export async function inspectUpdate(project) {
  if (!path.isAbsolute(project || '') || !(await exists(path.join(project, 'package.json')))) {
    throw new Error('This app could not find the folder it was built from. Choose that folder once.');
  }
  await git(project, ['fetch', '--quiet', 'origin']);
  const branch = (await git(project, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
  // Only a branch's own remote counts as a source of updates. A worktree on a
  // feature branch must not be fast-forwarded with someone else's commits.
  let tracking = null;
  const own = `origin/${branch}`;
  try {
    await git(project, ['rev-parse', '--verify', '--quiet', `refs/remotes/${own}`]);
    tracking = own;
  } catch {}
  const behind = tracking ? Number((await git(project, ['rev-list', '--count', `HEAD..${tracking}`])).trim()) : 0;
  const ahead = tracking ? Number((await git(project, ['rev-list', '--count', `${tracking}..HEAD`])).trim()) : 0;
  const dirty = (await git(project, ['status', '--porcelain'])).trim().length > 0;
  const commit = (await git(project, ['rev-parse', '--short', 'HEAD'])).trim();
  return { project, branch, tracking, behind, ahead, dirty, commit };
}

export function describeUpdate(info) {
  if (!info) return 'No source folder is connected.';
  if (info.dirty) return 'This source folder has uncommitted changes.';
  if (!info.tracking) return `Built from ${info.branch} at ${info.commit}. That branch has no remote copy, so installs rebuild what is here.`;
  if (info.behind === 0) return `Up to date on ${info.branch}.`;
  return `${info.behind} new commit${info.behind === 1 ? '' : 's'} on ${info.branch} from ${info.tracking}.`;
}

export function buildInstallScript({ built, target, pid }) {
  const q = value => `'${String(value).replace(/'/g, `'\\''`)}'`;
  const staged = `${target}.staged`, previous = `${target}.previous`;
  return `#!/bin/sh
set -eu
for i in $(seq 1 480); do
  kill -0 ${Number(pid)} 2>/dev/null || break
  sleep 0.25
done
rm -rf ${q(staged)}
ditto ${q(built)} ${q(staged)}
mv ${q(target)} ${q(previous)}
if ! mv ${q(staged)} ${q(target)}; then
  mv ${q(previous)} ${q(target)} || true
  rm -rf ${q(staged)}
  exit 1
fi
rm -rf ${q(previous)}
open ${q(target)}
`;
}

// A crash between the two moves would leave the app missing and the old copy
// in .previous. Put the old copy back before anything else runs.
export async function reconcileInstall(target) {
  if (!(await exists(target)) && await exists(`${target}.previous`)) {
    await rename(`${target}.previous`, target);
    return true;
  }
  await rm(`${target}.staged`, { recursive: true, force: true });
  if (await exists(target)) await rm(`${target}.previous`, { recursive: true, force: true });
  return false;
}

async function packageApp(project, progress) {
  progress('Building the app…');
  await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'package'], { cwd: project, timeout: 900_000, maxOutput: 2_000_000 });
  const { productName } = JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8'));
  const built = path.join(project, 'release', `mac-${process.arch}`, `${productName || 'vocalist'}.app`);
  if (!(await exists(built))) throw new Error(`The build finished without ${path.basename(built)}.`);
  return built;
}

export async function applyUpdate(project, { target, pid, progress = () => {}, mode = 'update' }) {
  const state = await inspectUpdate(project);
  if (mode === 'update') {
    if (state.dirty && state.behind > 0) throw new Error('This source folder has uncommitted changes. Commit or stash them, or rebuild from the current folder instead.');
    if (state.tracking && state.behind > 0) {
      progress(`Pulling ${state.behind} new commit${state.behind === 1 ? '' : 's'}…`);
      await git(project, ['merge', '--ff-only', state.tracking]);
    }
  }
  const built = await packageApp(project, progress);
  progress('Installing the new version…');
  const directory = await mkdtemp(path.join(path.dirname(target), '.update-'));
  const script = path.join(directory, 'install.sh');
  await writeFile(script, buildInstallScript({ built, target, pid }), { mode: 0o755 });
  spawn('/bin/sh', [script], { detached: true, stdio: 'ignore' }).unref();
  return { built };
}
