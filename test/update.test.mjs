import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ROOT, loadProject, publishFiles, update } from '../src/update.mjs';
import { DIVINE, EXALTED } from '../src/economy.mjs';
import { DEFAULT_SOUNDS, FADED_CRISIS_FRAGMENT } from '../src/filter.mjs';

const SOUND_FILES = Object.values(DEFAULT_SOUNDS).sort();
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
  assert.equal(project.mapping.length, 29);
  const fragment = project.mapping.find(item => item.base_type === 'Faded Crisis Fragment');
  for (const [key, value] of Object.entries(FADED_CRISIS_FRAGMENT)) assert.equal(fragment[key], value);
  assert.notEqual(fragment.item_class, 'Quest Items');
  assert.equal(project.config.customSounds, true);
  assert.deepEqual(project.config.sounds, DEFAULT_SOUNDS);
  assert.deepEqual(project.config.profiles.map(p => [p.minItemLevel, p.maxItemLevel]), [[1, 65], [79, 0], [82, 0]]);
});

test('the six active files contain complete PCM audio with the exact configured filenames', async () => {
  assert.equal(SOUND_FILES.length, 6);
  assert.ok(!SOUND_FILES.includes('0011.wav'));
  for (const name of SOUND_FILES) {
    const bytes = await fs.readFile(path.join(ROOT, 'assets', 'sounds', name));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', name);
    assert.equal(bytes.toString('ascii', 8, 12), 'WAVE', name);
    assert.equal(bytes.readUInt32LE(4) + 8, bytes.length, `${name}: complete RIFF container`);
    const chunks = new Map();
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const id = bytes.toString('ascii', offset, offset + 4);
      const length = bytes.readUInt32LE(offset + 4);
      assert.ok(offset + 8 + length <= bytes.length, `${name}: complete ${id} chunk`);
      chunks.set(id, bytes.subarray(offset + 8, offset + 8 + length));
      offset += 8 + length + (length % 2);
    }
    assert.ok(chunks.get('fmt ')?.length >= 16, `${name}: format chunk`);
    assert.equal(chunks.get('fmt ').readUInt16LE(0), 1, `${name}: PCM encoding`);
    assert.equal(chunks.get('fmt ').readUInt16LE(2), 2, `${name}: stereo`);
    assert.equal(chunks.get('fmt ').readUInt32LE(4), 22050, `${name}: sample rate`);
    assert.equal(chunks.get('fmt ').readUInt16LE(14), 16, `${name}: bits per sample`);
    assert.ok(chunks.get('data')?.length > 0, `${name}: audible sample data`);
  }
});

test('the Pinnacle Key mapping rejects quest IDs, spoofed classes and mismatched base types', async t => {
  const root = await copyProject(t, true, false);
  const mappingFile = path.join(root, 'currency-map.json');
  const mapping = JSON.parse(await fs.readFile(mappingFile, 'utf8'));
  const index = mapping.findIndex(item => item.base_type === 'Faded Crisis Fragment');
  assert.ok(index >= 0);
  for (const change of [
    { metadata_id: 'Metadata/Items/QuestItems/BurningMonolithKey2' },
    { item_class: 'Quest Items' },
    { item_class: 'Stackable Currency' },
    { item_class: undefined },
    { base_type: 'Chaos Orb' },
  ]) {
    const altered = [...mapping];
    altered[index] = { ...mapping[index], ...change };
    await fs.writeFile(mappingFile, JSON.stringify(altered));
    await assert.rejects(loadProject(root), /Invalid\/duplicate currency allowlist entry/);
  }
});

test('native offline build works without audio assets and preserves unrelated files', async t => {
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

test('custom audio build installs six active WAVs and preserves valid installed replacements', async t => {
  const root = await copyProject(t, true);
  const output = await scratch(t);
  await fs.mkdir(path.join(output, 'sounds'));
  const installed = await fs.readFile(path.join(root, 'assets', 'sounds', SOUND_FILES[0]));
  installed[installed.length - 1] ^= 1;
  await fs.writeFile(path.join(output, 'sounds', SOUND_FILES[0]), installed);
  const report = await update({ root, output, offline: true });
  assert.equal(report.CustomSoundsEnabled, true);
  assert.deepEqual(report.SoundFiles, SOUND_FILES);
  assert.deepEqual(report.SoundMapping, DEFAULT_SOUNDS);
  await assert.rejects(fs.readFile(path.join(output, 'sounds', '0011.wav')), { code: 'ENOENT' });
  assert.deepEqual(await fs.readFile(path.join(output, 'sounds', SOUND_FILES[0])), installed);
  for (const name of SOUND_FILES.slice(1)) assert.deepEqual(await fs.readFile(path.join(output, 'sounds', name)), await fs.readFile(path.join(root, 'assets', 'sounds', name)));
  for (const profile of report.Profiles) {
    const text = await fs.readFile(path.join(output, profile.file), 'utf8');
    const references = [...new Set([...text.matchAll(/CustomAlertSoundOptional "sounds\/([^"\r\n]+)"/g)].map(match => match[1]))].sort();
    assert.deepEqual(references, SOUND_FILES, 'every referenced filename exists with matching case');
  }
});

test('online generator renders fetched high-value currency and emits provenance', async t => {
  const root = await copyProject(t, false, false);
  const output = await scratch(t);
  const id = 'Metadata/Items/Currency/CurrencyFractureRare';
  const rows = [
    { league: 'Forbidden Rites', market_pair: [EXALTED, DIVINE], volume_traded: { [EXALTED]: 1000, [DIVINE]: 10 } },
    { league: 'Forbidden Rites', market_pair: [id, DIVINE], volume_traded: { [id]: 100, [DIVINE]: 200 } },
    { league: 'Forbidden Rites', market_pair: [FADED_CRISIS_FRAGMENT.metadata_id, DIVINE], volume_traded: { [FADED_CRISIS_FRAGMENT.metadata_id]: 100, [DIVINE]: 200 } },
  ];
  const report = await update({ root, output, now: 15000, fetchImpl: async url => new Response(JSON.stringify({ next_change_id: Number(url.split('/').at(-1)) + 3600, markets: rows })) });
  assert.equal(report.Offline, false);
  assert.equal(report.Hours.length, 3);
  assert.equal(report.AcceptedPrices.find(p => p.BaseType === 'Fracturing Orb').DivinePerItem, 2);
  const fragment = report.AcceptedPrices.find(p => p.BaseType === 'Faded Crisis Fragment');
  assert.equal(fragment.DivinePerItem, 2);
  assert.equal(fragment.MetadataId, FADED_CRISIS_FRAGMENT.metadata_id);
  assert.equal(fragment.ItemClass, 'Pinnacle Keys');
  const text = await fs.readFile(path.join(output, report.Profiles[0].file), 'utf8');
  assert.match(text, /Verified unit value >= 1 Divine[\s\S]*?"Fracturing Orb"[\s\S]*?PlayAlertSound 1 250/);
  assert.match(text, /Class == "Pinnacle Keys"\n\s*BaseType == "Faded Crisis Fragment"/);
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

test('sound mappings reject missing categories, unexpected categories and unsafe filenames', async t => {
  const root = await copyProject(t, true, false);
  const configFile = path.join(root, 'config.json');
  const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
  const { maps, ...missingMaps } = DEFAULT_SOUNDS;
  for (const sounds of [
    missingMaps,
    { ...DEFAULT_SOUNDS, extra: 'extra.wav' },
    { ...DEFAULT_SOUNDS, value: '../0161.wav' },
    { ...DEFAULT_SOUNDS, value: '0161.wav\nHide' },
    { ...DEFAULT_SOUNDS, value: '0161.mp3' },
  ]) {
    await fs.writeFile(configFile, JSON.stringify({ ...config, sounds }));
    await assert.rejects(loadProject(root), /Invalid sound filenames or categories/);
  }
});

test('missing or corrupt source audio cannot replace an existing valid build', async t => {
  for (const scenario of ['missing', 'bad header', 'truncated']) {
    await t.test(scenario, async t => {
      const root = await copyProject(t, false);
      const output = await scratch(t);
      const first = await update({ root, output, offline: true });
      const names = [...first.Profiles.map(p => p.file), 'last-update.json'];
      const before = await Promise.all(names.map(name => fs.readFile(path.join(output, name))));
      const configFile = path.join(root, 'config.json');
      const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
      await fs.writeFile(configFile, JSON.stringify({ ...config, customSounds: true }));
      const audioFile = path.join(root, 'assets', 'sounds', DEFAULT_SOUNDS.pinnacle);
      if (scenario === 'missing') await fs.unlink(audioFile);
      else if (scenario === 'bad header') await fs.writeFile(audioFile, 'not a WAV file');
      else {
        const original = await fs.readFile(audioFile);
        await fs.writeFile(audioFile, original.subarray(0, 44));
      }
      await assert.rejects(update({ root, output, offline: true }), scenario === 'missing' ? { code: 'ENOENT' } : /Invalid WAV audio/);
      for (const [index, name] of names.entries()) assert.deepEqual(await fs.readFile(path.join(output, name)), before[index]);
      assert.deepEqual((await fs.readdir(output)).sort(), names.sort(), 'no partial audio or staged files were published');
    });
  }
});

test('corrupt installed audio is rejected before filters or the update report change', async t => {
  const root = await copyProject(t, true);
  const output = await scratch(t);
  const first = await update({ root, output, offline: true });
  const names = [...first.Profiles.map(p => p.file), 'last-update.json'];
  const before = await Promise.all(names.map(name => fs.readFile(path.join(output, name))));
  await fs.writeFile(path.join(output, 'sounds', DEFAULT_SOUNDS.value), 'damaged installed file');
  await assert.rejects(update({ root, output, offline: true }), /Invalid WAV audio/);
  for (const [index, name] of names.entries()) assert.deepEqual(await fs.readFile(path.join(output, name)), before[index]);
  assert.equal(await fs.readFile(path.join(output, 'sounds', DEFAULT_SOUNDS.value), 'utf8'), 'damaged installed file');
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
