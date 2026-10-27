import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ROOT, loadProject, publishFiles, update } from '../src/update.mjs';
import { DIVINE, EXALTED } from '../src/economy.mjs';

const SOUND_FILES = ['tw-rare-drop.wav', 'tw-level-up.wav', 'tw-quest-reward.wav'];
async function scratch(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'poe2-github-test-'));
  t.after(async () => {
    const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(directory));
    assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(directory).startsWith('poe2-github-test-'));
    await fs.rm(directory, { recursive: true, force: true });
  });
  return directory;
}

async function copyProject(t, customSounds, includeAssets = true) {
  const root = await scratch(t);
  const config = JSON.parse(await fs.readFile(path.join(ROOT, 'config.json'), 'utf8'));
  config.customSounds = customSounds;
  await fs.writeFile(path.join(root, 'config.json'), JSON.stringify(config));
  await fs.copyFile(path.join(ROOT, 'currency-map.json'), path.join(root, 'currency-map.json'));
  await fs.mkdir(path.join(root, 'upstream'));
  for (const entry of config.upstream.files) await fs.copyFile(path.join(ROOT, 'upstream', entry.file), path.join(root, 'upstream', entry.file));
  if (includeAssets) {
    await fs.mkdir(path.join(root, 'assets', 'sounds'), { recursive: true });
    for (const name of SOUND_FILES) await fs.copyFile(path.join(ROOT, 'assets', 'sounds', name), path.join(root, 'assets', 'sounds', name));
  }
  return root;
}

test('project validates pinned sources and all three profiles', async () => {
  const project = await loadProject();
  assert.equal(project.sources.size, 2);
  assert.equal(project.mapping.length, 28);
  assert.equal(project.config.customSounds, false);
  assert.deepEqual(project.config.profiles.map(p => [p.minItemLevel, p.maxItemLevel]), [[1, 79], [80, 81], [81, 0]]);
});

test('default offline build uses native audio without reading assets and preserves unrelated files', async t => {
  const root = await copyProject(t, false, false);
  const output = await scratch(t);
  await fs.mkdir(path.join(output, 'sounds'));
  await fs.writeFile(path.join(output, 'sounds', SOUND_FILES[0]), 'user-provided-audio');
  await fs.writeFile(path.join(output, 'keep.txt'), 'unrelated');
  const report = await update({ root, output, offline: true, fetchImpl: () => { throw new Error('Network must not be used'); } });
  assert.equal(report.Offline, true);
  assert.equal(report.AcceptedPrices.length, 0);
  assert.equal(report.CustomSoundsEnabled, false);
  assert.deepEqual(report.SoundFiles, []);
  for (const profile of report.Profiles) {
    const text = await fs.readFile(path.join(output, profile.file), 'utf8');
    assert.match(text, /BEGIN PERSONAL ITEMLEVEL RANGE/);
    assert.doesNotMatch(text, /^[ \t]*CustomAlertSound\w*\b/m);
  }
  assert.equal(await fs.readFile(path.join(output, 'sounds', SOUND_FILES[0]), 'utf8'), 'user-provided-audio');
  assert.equal(await fs.readFile(path.join(output, 'keep.txt'), 'utf8'), 'unrelated');
  for (const name of SOUND_FILES.slice(1)) await assert.rejects(fs.readFile(path.join(output, 'sounds', name)), { code: 'ENOENT' });
});

test('explicit future custom audio mode copies assets while preserving installed custom audio', async t => {
  const root = await copyProject(t, true);
  const output = await scratch(t);
  await fs.mkdir(path.join(output, 'sounds'));
  await fs.writeFile(path.join(output, 'sounds', SOUND_FILES[0]), 'user-provided-audio');
  const report = await update({ root, output, offline: true });
  assert.equal(report.CustomSoundsEnabled, true);
  assert.deepEqual(report.SoundFiles, SOUND_FILES);
  assert.equal(await fs.readFile(path.join(output, 'sounds', SOUND_FILES[0]), 'utf8'), 'user-provided-audio');
  for (const name of SOUND_FILES.slice(1)) assert.equal((await fs.readFile(path.join(output, 'sounds', name))).subarray(0, 4).toString(), 'RIFF');
  for (const profile of report.Profiles) assert.match(await fs.readFile(path.join(output, profile.file), 'utf8'), /CustomAlertSoundOptional "sounds\/tw-rare-drop.wav"/);
});

test('online generator renders fetched high-value currency and emits provenance', async t => {
  const output = await scratch(t);
  const id = 'Metadata/Items/Currency/CurrencyFractureRare';
  const rows = [
    { league: 'Forbidden Rites', market_pair: [EXALTED, DIVINE], volume_traded: { [EXALTED]: 1000, [DIVINE]: 10 } },
    { league: 'Forbidden Rites', market_pair: [id, DIVINE], volume_traded: { [id]: 100, [DIVINE]: 200 } },
  ];
  const report = await update({ output, now: 15000, fetchImpl: async url => new Response(JSON.stringify({ next_change_id: Number(url.split('/').at(-1)) + 3600, markets: rows })) });
  assert.equal(report.Offline, false);
  assert.equal(report.Hours.length, 3);
  assert.equal(report.AcceptedPrices.find(p => p.BaseType === 'Fracturing Orb').DivinePerItem, 2);
  const text = await fs.readFile(path.join(output, report.Profiles[0].file), 'utf8');
  assert.match(text, /Verified unit value >= 1 Divine[\s\S]*?"Fracturing Orb"[\s\S]*?PlayAlertSound 1 250/);
  assert.doesNotMatch(text, /^[ \t]*CustomAlertSound\w*\b/m);
  assert.equal(report.CustomSoundsEnabled, false);
  assert.deepEqual(report.SoundFiles, []);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(output, 'last-update.json'), 'utf8')).Hours, report.Hours);
});

test('network/league failure preserves all prior generated bytes and report', async t => {
  const output = await scratch(t);
  const first = await update({ output, offline: true });
  const names = [...first.Profiles.map(p => p.file), 'last-update.json'];
  const before = await Promise.all(names.map(name => fs.readFile(path.join(output, name))));
  await assert.rejects(update({ output, fetchImpl: async () => new Response('{}', { status: 503 }) }), /503/);
  await assert.rejects(update({ output, league: 'Missing', now: 15000, fetchImpl: async url => new Response(JSON.stringify({ next_change_id: Number(url.split('/').at(-1)) + 3600, markets: [] })) }), /fewer than two/);
  for (const [index, name] of names.entries()) assert.deepEqual(await fs.readFile(path.join(output, name)), before[index]);
});

test('changed upstream source hash is rejected', async t => {
  const root = await scratch(t);
  await fs.copyFile(path.join(ROOT, 'config.json'), path.join(root, 'config.json'));
  await fs.copyFile(path.join(ROOT, 'currency-map.json'), path.join(root, 'currency-map.json'));
  await fs.mkdir(path.join(root, 'upstream'));
  await fs.writeFile(path.join(root, 'upstream', 'Regular.filter'), 'modified upstream');
  await assert.rejects(loadProject(root), /checksum mismatch/);
});

test('custom audio mode requires a boolean setting', async t => {
  const root = await copyProject(t, 'false');
  await assert.rejects(loadProject(root), /customSounds|custom sound/i);
});

test('staging errors leave existing files unchanged and clean temporary files', async t => {
  const output = await scratch(t);
  await fs.writeFile(path.join(output, 'a.filter'), 'old');
  await fs.mkdir(path.join(output, 'blocked.filter'));
  await assert.rejects(publishFiles(output, new Map([['a.filter', 'new'], ['blocked.filter', 'bad']])));
  assert.equal(await fs.readFile(path.join(output, 'a.filter'), 'utf8'), 'old');
  assert.equal((await fs.readdir(output)).some(name => name.endsWith('.tmp')), false);
  await assert.rejects(publishFiles(output, new Map([['../escape.filter', 'bad']])), /Invalid generated output path/);
});
