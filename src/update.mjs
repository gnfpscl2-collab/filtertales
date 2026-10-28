import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { fetchHours, getPrices } from './economy.mjs';
import { renderFilter, baselineFloors, DEFAULT_SOUNDS, validateSounds, FADED_CRISIS_FRAGMENT } from './filter.mjs';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));

export async function loadProject(root = ROOT) {
  const config = JSON.parse(await fs.readFile(path.join(root, 'config.json'), 'utf8'));
  const mapping = JSON.parse(await fs.readFile(path.join(root, 'currency-map.json'), 'utf8'));
  if (typeof config.customSounds !== 'boolean') throw new Error('config.customSounds must be a boolean.');
  config.sounds = validateSounds(config.sounds ?? { ...DEFAULT_SOUNDS });
  if (!config.upstream || !Array.isArray(config.upstream.files) || config.upstream.files.length !== 2 || !Array.isArray(config.profiles) || config.profiles.length !== 3) {
    throw new Error('Expected two pinned upstream sources and three profiles.');
  }
  const sources = new Map();
  for (const entry of config.upstream.files) {
    if (!/^[A-Za-z0-9-]+\.filter$/.test(entry.file) || !['Leveling', 'Endgame'].includes(entry.mode) || sources.has(entry.mode)) throw new Error('Invalid upstream entry.');
    const bytes = await fs.readFile(path.join(root, 'upstream', entry.file));
    const hash = createHash('sha256').update(bytes).digest('hex').toUpperCase();
    if (hash !== entry.sha256) throw new Error(`Upstream checksum mismatch: ${entry.file}`);
    sources.set(entry.mode, bytes.toString('utf8'));
    baselineFloors(bytes.toString('utf8'));
  }
  const outputNames = new Set();
  for (const profile of config.profiles) {
    if (!/^Personal-[A-Za-z0-9-]+\.filter$/.test(profile.file) || outputNames.has(profile.file) || !sources.has(profile.sourceMode)) throw new Error('Invalid/duplicate profile.');
    if (!Number.isSafeInteger(profile.minItemLevel) || profile.minItemLevel < 1 || !Number.isSafeInteger(profile.maxItemLevel) || profile.maxItemLevel < 0 || (profile.maxItemLevel && profile.maxItemLevel < profile.minItemLevel)) throw new Error('Invalid profile item-level range.');
    outputNames.add(profile.file);
  }
  if (!Array.isArray(mapping) || !mapping.length) throw new Error('Invalid currency allowlist.');
  const seen = new Set();
  const source = sources.get('Leveling');
  const sections = [...source.matchAll(/^# \[\[2600\]\][\s\S]*?(?=^# \[\[2700\]\])/gm)];
  const section = sections.at(-1)?.[0];
  if (!section) throw new Error('Upstream currency section missing.');
  for (const item of mapping) {
    const pinnacle = Object.entries(FADED_CRISIS_FRAGMENT).every(([key, value]) => item[key] === value);
    if (!/^[A-Za-z][A-Za-z0-9 ',\-]{1,90}$/.test(item.base_type)
      || (!pinnacle && (!/^Metadata\/Items\/Currency\/[A-Za-z0-9]+$/.test(item.metadata_id)
        || (item.item_class && item.item_class !== 'Stackable Currency')))
      || seen.has(item.metadata_id)) throw new Error('Invalid/duplicate currency allowlist entry.');
    seen.add(item.metadata_id);
    if (pinnacle) {
      if ([...sources.values()].some(s => !s.includes('Class == "Pinnacle Keys"'))) throw new Error('Upstream Pinnacle Keys class missing.');
      continue;
    }
    if (!section.includes(`"${item.base_type}"`) || [...sources.values()].some(s => !s.includes(`"${item.base_type}"`))) throw new Error(`Currency absent from upstream: ${item.base_type}`);
  }
  return { config, mapping, sources };
}

async function readExisting(filename) {
  try { return await fs.readFile(filename); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export async function publishFiles(directory, files) {
  const staged = [];
  const published = [];
  await fs.mkdir(directory, { recursive: true });
  try {
    for (const [name, bytes] of files) {
      if (path.isAbsolute(name) || name.split(/[\\/]/).some(part => part === '..' || !part)) throw new Error('Invalid generated output path.');
      const destination = path.join(directory, name);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      const previous = await readExisting(destination);
      const temporary = path.join(path.dirname(destination), `.poe2-${randomUUID()}.tmp`);
      const file = { destination, temporary, previous };
      staged.push(file);
      await fs.writeFile(temporary, bytes, { flag: 'wx' });
    }
    for (const file of staged) {
      await fs.rename(file.temporary, file.destination);
      published.push(file);
    }
  } catch (error) {
    for (const file of published.reverse()) {
      if (file.previous === null) await fs.unlink(file.destination);
      else await fs.writeFile(file.destination, file.previous);
    }
    throw error;
  } finally {
    for (const file of staged) await fs.rm(file.temporary, { force: true });
  }
}

export async function update({ root = ROOT, output = path.join(root, 'dist'), league, offline = false, fetchImpl = fetch, now } = {}) {
  const { config, mapping, sources } = await loadProject(root);
  league = league || config.league;
  if (typeof league !== 'string' || !/^[^\r\n\x00-\x1f]{1,100}$/.test(league)) throw new Error('Invalid league name.');
  const hours = offline ? [] : await fetchHours({ now, fetchImpl });
  const prices = offline ? [] : getPrices(hours, league, mapping);
  const dataLabel = offline ? 'offline baseline; no live economy' : `hour starts UTC unix: ${hours.map(h => h.Hour).join(',')}`;
  const files = new Map();
  for (const profile of config.profiles) {
    files.set(profile.file, renderFilter({ source: sources.get(profile.sourceMode), prices, league, profile, release: config.upstream.release, dataLabel, customSounds: config.customSounds, sounds: config.sounds }));
  }
  const soundFiles = config.customSounds ? [...new Set(Object.values(config.sounds))].sort() : [];
  const report = {
    GeneratedUtc: new Date().toISOString(), League: league, Offline: offline,
    UpstreamRelease: config.upstream.release, UpstreamCommit: config.upstream.commit,
    Source: 'GGG public currency-exchange/poe2 hourly executed-volume digests',
    Method: 'Validate direct Divine, same-hour Chaos and Exalted routes independently; choose the highest accepted Divine unit value. >=1 Divine is S+ with value audio in all areas.',
    Guards: 'At least 2 hours, 10 item units, 1 Divine equivalent volume; max/min hourly price <=3.',
    Hours: hours.map(h => ({ StartUnix: h.Hour, Url: h.Url })), AcceptedPrices: prices,
    Profiles: config.profiles, CustomSoundsEnabled: config.customSounds,
    SoundFiles: soundFiles, SoundMapping: config.sounds,
    AudioStatus: config.customSounds ? 'User-supplied WAV audio enabled; missing audio falls back to built-in alerts.' : 'Built-in PoE2 alerts only. Custom audio is disabled.',
  };
  files.set('last-update.json', JSON.stringify(report, null, 2) + '\n');
  for (const name of soundFiles) {
    const existing = await readExisting(path.join(output, 'sounds', name));
    const bytes = existing ?? await fs.readFile(path.join(root, 'assets', 'sounds', name));
    if (bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE' || bytes.readUInt32LE(4) + 8 > bytes.length) {
      throw new Error(`Invalid WAV audio: ${name}`);
    }
    files.set(`sounds/${name}`, bytes);
  }
  await publishFiles(output, files);
  return report;
}

function parseArgs(args) {
  const options = { league: process.env.POE_LEAGUE || undefined };
  while (args.length) {
    const name = args.shift();
    if (name === '--offline') options.offline = true;
    else if (['--league', '--output'].includes(name) && args[0] && !args[0].startsWith('--')) options[name.slice(2)] = name === '--output' ? path.resolve(args.shift()) : args.shift();
    else throw new Error(`Unknown or incomplete argument: ${name}`);
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await update(parseArgs(process.argv.slice(2)));
    console.log(`Generated three filters | league=${report.League} | accepted prices=${report.AcceptedPrices.length} | offline=${report.Offline}`);
    console.log('Download the successful GitHub Actions artifact, copy to the game filter folder, and reload manually.');
  } catch (error) {
    console.error(`Filter update failed: ${error.message}`);
    process.exitCode = 1;
  }
}
