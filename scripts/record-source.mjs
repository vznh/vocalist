import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();

// A worktree shares history with the main checkout, so remember the worktree
// root itself. Updates fetch and pull in the folder the build came from.
const project = git(['rev-parse', '--show-toplevel']);
const commit = git(['rev-parse', 'HEAD']);
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
const out = path.join(root, '.runtime', 'source.json');
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, JSON.stringify({ project, branch, commit, builtAt: new Date().toISOString() }, null, 2));
console.log(`recorded build source ${project}@${commit.slice(0, 7)}`);
