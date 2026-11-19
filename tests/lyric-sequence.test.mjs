import test from 'node:test';
import assert from 'node:assert/strict';
import { frameState, lyricPairs } from '../shared/lyric-sequence.mjs';
import { scrollingState } from '../shared/karaoke.mjs';
const rows = count => Array.from({ length: count }, (_, index) => ({ text: `Line ${index + 1}`, start: 1 + index * 2, end: 2 + index * 2, words: [{ text: `Line ${index + 1}`, start: 1 + index * 2, end: 2 + index * 2 }], blockStart: index === 0 }));
const slots = (lines, time) => frameState(lines, time, 30).map(({ index, slot }) => [index, slot]);
test('consumed pairs are replaced in their original slots while the other pair stays fixed', () => {
  const lines = rows(10);
  assert.deepEqual(slots(lines, 0), [[0, 0], [1, 1], [2, 2], [3, 3]]);
  assert.deepEqual(slots(lines, 5.7), [[4, 0], [5, 1], [2, 2], [3, 3]]);
  assert.deepEqual(slots(lines, 9.7), [[4, 0], [5, 1], [6, 2], [7, 3]]);
  assert.deepEqual(slots(lines, 13.7), [[8, 0], [9, 1], [6, 2], [7, 3]]);
  const lower = frameState(lines, 5.7, 30).filter(row => row.slot >= 2);
  assert.ok(lower.every(row => row.opacity === 1));
});
test('outgoing text finishes fading before replacement text fades into the same slots', () => {
  const lines = rows(8);
  const old = frameState(lines, 5.225, 30).find(row => row.index === 0);
  assert.ok(Math.abs(old.opacity - .5) < .001);
  assert.equal(frameState(lines, 5.225, 30).some(row => row.index === 4), false);
  const next = frameState(lines, 5.675, 30).find(row => row.index === 4);
  assert.ok(Math.abs(next.opacity - .5) < .001);
  assert.equal(frameState(lines, 5.675, 30).some(row => row.index === 0), false);
});
test('seeking backwards reconstructs the correct pair sequence without history', () => {
  const lines = rows(10), before = frameState(lines, 5.7, 30);
  frameState(lines, 18, 30); frameState(lines, 0, 30);
  assert.deepEqual(frameState(lines, 5.7, 30), before);
});
test('very short Yes lines stay visible at onset and are never skipped by long fades', () => {
  const lines = Array.from({ length: 10 }, (_, index) => ({ text: 'Yes', start: 1 + index * .1, end: 1.07 + index * .1, words: [{ text: 'Yes', start: 1 + index * .1, end: 1.07 + index * .1 }] }));
  for (let index = 0; index < lines.length; index++) {
    const active = frameState(lines, lines[index].start + .035, 3).find(row => row.index === index);
    assert.ok(active, `Line ${index + 1} was skipped`);
    assert.equal(active.opacity, 1);
    assert.equal(active.slot, Math.floor(index / 2) % 2 * 2 + index % 2);
  }
});
test('odd-length verses start a fresh pair and the final single line fades after singing', () => {
  const lines = rows(7); lines[3].blockStart = true;
  assert.deepEqual(lyricPairs(lines), [[0, 1], [2], [3, 4], [5, 6]]);
  assert.deepEqual(slots(lines, 5.7), [[3, 0], [4, 1], [2, 2]]);
  const final = rows(5);
  assert.equal(frameState(final, 9.5, 30).find(row => row.index === 4).opacity, 1);
  assert.deepEqual(frameState(final, 10.5, 30), []);
});

test('two verses singing at once both highlight in Rolling mode', () => {
  const blocks = [{ start: 8, end: 13.9 }, { start: 10, end: 12 }, { start: 12, end: 14 }, { start: 14, end: 16 }];
  assert.deepEqual([...scrollingState(blocks, 11).singing], [0, 1]);
  assert.deepEqual([...scrollingState(blocks, 13).singing], [0, 2]);
  assert.deepEqual([...scrollingState(blocks, 15).singing], [3]);
  assert.deepEqual([...scrollingState(blocks, 5).singing], []);
});
test('the scroll anchor follows the newest singing verse without losing the other highlight', () => {
  const blocks = [{ start: 0, end: 4 }, { start: 4, end: 8 }, { start: 6, end: 10 }, { start: 10, end: 12 }];
  const state = scrollingState(blocks, 7);
  assert.equal(state.anchor, 2); assert.equal(state.from, 1); assert.deepEqual([...state.singing], [1, 2]);
});
