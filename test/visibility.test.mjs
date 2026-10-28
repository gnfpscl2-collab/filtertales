import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyEndgameVisibility, renderFilter, FADED_CRISIS_FRAGMENT } from '../src/filter.mjs';

const root = new URL('../', import.meta.url);
const config = JSON.parse(readFileSync(new URL('config.json', root), 'utf8'));
const source = readFileSync(new URL('upstream/SemiStrict.filter', root), 'utf8');
const levelingSource = readFileSync(new URL('upstream/Regular.filter', root), 'utf8');
const actions = /^(?:Set\w+|Play\w+|MinimapIcon|CustomAlertSound\w*|Disable\w+|Enable\w+|Continue)\b/;
const notifications = /^(?:PlayAlertSound(?:Positional)?|CustomAlertSound\w*|PlayEffect|MinimapIcon)\b/;
const rarities = ['Normal', 'Magic', 'Rare', 'Unique'];
const numeric = new Set(['AreaLevel', 'ItemLevel', 'DropLevel', 'Quality', 'Sockets', 'StackSize', 'Height', 'Width',
  'GemLevel', 'WaystoneTier', 'BaseArmour', 'BaseEvasion', 'BaseEnergyShield', 'UnidentifiedItemTier']);
const booleans = new Set(['AlwaysShow', 'AnyEnchantment', 'Corrupted', 'Identified', 'Mirrored', 'TwiceCorrupted', 'HasVaalUniqueMod', 'IsVaalUnique']);
const fixture = changes => ({
  BaseType: 'Crude Bow', Class: 'Bows', Rarity: 'Rare', AreaLevel: 82, ItemLevel: 82,
  Height: 3, Width: 2, StackSize: 1, HasExplicitMod: [], ...changes,
});
const compare = (a, operator, b) => ({
  '>': () => a > b, '>=': () => a >= b, '<': () => a < b, '<=': () => a <= b,
  '!': () => a !== b, '!=': () => a !== b, '=': () => a === b, '==': () => a === b,
}[operator]());

// This evaluator covers the pinned filter's conditions for fixture checks, not the game parser.
function matches(line, item) {
  const [, key, expression] = line.match(/^(\w+)\s+(.+)$/) ?? [];
  assert.ok(key, `unparsed condition: ${line}`);
  const operator = expression.match(/^(==|!=|>=|<=|>|<|=|!)/)?.[1];
  const valueText = operator ? expression.slice(operator.length).trim() : expression;
  const quoted = [...valueText.matchAll(/"([^"]*)"/g)].map(match => match[1]);
  if (key === 'Class' || key === 'BaseType') {
    assert.ok(quoted.length, line);
    const hit = quoted.some(value => operator === '==' ? item[key] === value : (item[key] ?? '').includes(value));
    return operator === '!' || operator === '!=' ? !hit : hit;
  }
  if (key === 'Rarity') {
    const values = valueText.split(/\s+/);
    return operator ? compare(rarities.indexOf(item.Rarity), operator, rarities.indexOf(values[0])) : values.includes(item.Rarity);
  }
  if (key === 'HasExplicitMod') {
    const required = Number(valueText.match(/^\d+/)?.[0] ?? 1);
    const count = (item.HasExplicitMod ?? []).filter(mod => quoted.some(value => mod.includes(value))).length;
    return compare(count, operator ?? '>=', required);
  }
  if (numeric.has(key)) return compare(item[key] ?? 0, operator ?? '=', Number(valueText));
  if (booleans.has(key)) return (item[key] ?? false) === (valueText === 'True');
  assert.fail(`unsupported fixture condition: ${key}`);
}

function firstTerminal(filter, changes) {
  const item = fixture(changes);
  const inheritedNotifications = new Map();
  for (const match of filter.matchAll(/^(Show|Hide)[^\r\n]*\r?\n(?:[ \t]+\S[^\r\n]*(?:\r?\n|$))+/gm)) {
    const block = match[0];
    const conditions = block.split(/\r?\n/).slice(1).map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && !actions.test(line));
    if (conditions.every(line => matches(line, item))) {
      for (const line of block.split(/\r?\n/).map(line => line.trim()).filter(line => notifications.test(line))) {
        inheritedNotifications.set(line.split(/\s+/, 1)[0], line);
      }
      if (!/^\s*Continue\b/m.test(block)) {
        return { action: match[1], header: block.split(/\r?\n/, 1)[0], block, notificationLines: [...inheritedNotifications.values()] };
      }
    }
  }
  assert.fail(`fixture reached no terminal rule: ${JSON.stringify(item)}`);
}

const render = (profile = config.profiles[2], customSounds = true, prices = []) => renderFilter({
  source: profile.sourceMode === 'Leveling' ? levelingSource : source, prices, profile, customSounds, sounds: config.sounds, league: 'Fixture League',
  release: config.upstream.release, dataLabel: 'strict visibility fixture',
});

test('strict endgame hides ordinary magic and low rare gear before broad upstream Show rules', () => {
  const filter = render();
  for (const item of [
    { Rarity: 'Magic' },
    { Rarity: 'Magic', ItemLevel: 90 },
    { BaseType: 'Conjurer Mantle', Class: 'Body Armours', UnidentifiedItemTier: 2 },
    { BaseType: 'Conjurer Mantle', Class: 'Body Armours', UnidentifiedItemTier: 3, ItemLevel: 81 },
    { UnidentifiedItemTier: 4 },
    { UnidentifiedItemTier: 5 },
    { BaseType: 'Amethyst Ring', Class: 'Rings', UnidentifiedItemTier: 2 },
  ]) {
    const result = firstTerminal(filter, item);
    assert.equal(result.action, 'Hide', JSON.stringify(item));
    assert.deepEqual(result.notificationLines, [], 'hidden gear inherits no sound, beam or minimap icon');
  }
  for (const item of [
    { BaseType: 'Conjurer Mantle', Class: 'Body Armours', UnidentifiedItemTier: 3 },
    { BaseType: 'Conjurer Mantle', Class: 'Body Armours', UnidentifiedItemTier: 4 },
    { BaseType: 'Amethyst Ring', Class: 'Rings', UnidentifiedItemTier: 3 },
  ]) assert.equal(firstTerminal(filter, item).action, 'Show', JSON.stringify(item));
});

test('special base, quality, sockets, known visible mods and twice-corrupted gear remain protected', () => {
  const filter = render();
  for (const item of [
    { BaseType: 'Breach Ring', Class: 'Rings', Rarity: 'Magic' },
    { Rarity: 'Magic', Quality: 27 },
    { Rarity: 'Magic', Sockets: 3 },
    { Rarity: 'Rare', TwiceCorrupted: true },
    { BaseType: 'Ashen Wand', Class: 'Wands', Rarity: 'Magic', Identified: true, HasExplicitMod: ['Runic'] },
  ]) assert.equal(firstTerminal(filter, item).action, 'Show', JSON.stringify(item));
});

test('C unique rings are hidden before recipe and generic corrupted protections while high and ambiguous bases remain', () => {
  const filter = render();
  for (const Corrupted of [false, true]) {
    const result = firstTerminal(filter, { BaseType: 'Amethyst Ring', Class: 'Rings', Rarity: 'Unique', Corrupted });
    assert.equal(result.action, 'Hide', result.header);
    assert.deepEqual(result.notificationLines, [], 'hidden C uniques have no sound, beam or minimap icon');
  }
  for (const item of [
    { BaseType: 'Armoured Cap', Class: 'Helmets', Rarity: 'Unique' },
    { BaseType: 'Heavy Belt', Class: 'Belts', Rarity: 'Unique' },
    { BaseType: 'Unlisted Future Base', Class: 'Wands', Rarity: 'Unique' },
    { BaseType: 'Amethyst Ring', Class: 'Rings', Rarity: 'Unique', TwiceCorrupted: true },
    { BaseType: 'Amethyst Ring', Class: 'Rings', Rarity: 'Unique', HasVaalUniqueMod: true },
  ]) assert.equal(firstTerminal(filter, item).action, 'Show', JSON.stringify(item));
});

test('low runes, essences and selected material names are hidden without hiding ordinary currencies', () => {
  const filter = render();
  for (const [BaseType, Class] of [
    ['Ancient Rune of Animosity', 'Augment'], ['Greater Adept Rune', 'Augment'], ['Greater Body Rune', 'Augment'],
    ['Greater Essence of Haste', 'Stackable Currency'], ['Essence of Haste', 'Stackable Currency'],
    ['Greater Essence of Battle', 'Stackable Currency'], ['Adaptive Catalyst', 'Stackable Currency'],
    ['Diluted Liquid Greed', 'Stackable Currency'], ['Diluted Liquid Guilt', 'Stackable Currency'],
  ]) {
    const result = firstTerminal(filter, { BaseType, Class, Rarity: 'Normal' });
    assert.equal(result.action, 'Hide', BaseType);
    assert.deepEqual(result.notificationLines, [], `${BaseType}: hidden material has no inherited alerts`);
  }
  for (const [BaseType, Class] of [
    ['Soul Core of Azcapa', 'Augment'], ['Masterwork Rune', 'Augment'], ['Greater Ward Rune', 'Augment'],
    ['Essence of Hysteria', 'Stackable Currency'], ['Essence of Horror', 'Stackable Currency'],
    ['Essence of Insanity', 'Stackable Currency'], ['Reaver Catalyst', 'Stackable Currency'],
    ['Liquid Envy', 'Stackable Currency'], ['Exalted Orb', 'Stackable Currency'], ['Vaal Orb', 'Stackable Currency'],
    ['Unlisted Rune', 'Augment'], ['Essence of a Future Mechanic', 'Stackable Currency'],
  ]) assert.equal(firstTerminal(filter, { BaseType, Class, Rarity: 'Normal' }).action, 'Show', BaseType);
});

test('strict rules spare non-equipment and verified high-value prefixes in both audio modes', () => {
  const fragment = { BaseType: FADED_CRISIS_FRAGMENT.base_type, MetadataId: FADED_CRISIS_FRAGMENT.metadata_id,
    ItemClass: FADED_CRISIS_FRAGMENT.item_class, DivinePerItem: 2 };
  for (const customSounds of [false, true]) {
    const filter = render(config.profiles[2], customSounds, [fragment, { BaseType: 'Vaal Orb', DivinePerItem: 2 }]);
    for (const item of [
      { BaseType: 'Gold', Class: 'Gold', Rarity: 'Normal', StackSize: 500 },
      { BaseType: 'Waystone', Class: 'Waystones', Rarity: 'Magic', WaystoneTier: 15 },
      { BaseType: 'Expedition Tablet', Class: 'Tablet', Rarity: 'Rare' },
      { BaseType: 'Uncut Skill Gem', Class: 'Uncut Skill Gems', Rarity: 'Normal', GemLevel: 20 },
      { BaseType: 'Emerald', Class: 'Jewels', Rarity: 'Magic' },
      { BaseType: 'Faded Crisis Fragment', Class: 'Quest Items', Rarity: 'Normal', AlwaysShow: true },
      { BaseType: 'Faded Crisis Fragment', Class: 'Pinnacle Keys', Rarity: 'Normal' },
      { BaseType: 'Vaal Orb', Class: 'Stackable Currency', Rarity: 'Normal' },
    ]) assert.equal(firstTerminal(filter, item).action, 'Show', JSON.stringify(item));
    const high = firstTerminal(filter, { BaseType: 'Vaal Orb', Class: 'Stackable Currency', Rarity: 'Normal' });
    assert.match(high.header, /S\+ Verified unit value/);
    if (customSounds) assert.match(high.block, /sounds\/0161\.wav/);
    for (const match of filter.matchAll(/^Hide[^\r\n]*\r?\n(?:[ \t]+\S[^\r\n]*(?:\r?\n|$))+/gm)) {
      assert.doesNotMatch(match[0], /CustomAlertSound/);
    }
  }
});

test('strict selection changes only profile three and rejects changed policy anchors', () => {
  for (const profile of config.profiles.slice(0, 2)) {
    assert.equal(render(profile), render({ ...profile, strictEndgame: false }));
  }
  assert.notEqual(render(), render({ ...config.profiles[2], strictEndgame: false }));
  assert.throws(() => applyEndgameVisibility('Show\n    Rarity Rare\n'), /missing|changed|upstream|anchor/i);
});

test('new hidden categories remove native alerts, beams and icons as well as custom sounds', () => {
  const hides = text => [...text.matchAll(/^Hide[^\r\n]*\r?\n(?:[ \t]+\S[^\r\n]*(?:\r?\n|$))+/gm)].map(match => match[0]);
  const originalHeaders = new Set(hides(source).map(block => block.split(/\r?\n/, 1)[0]));
  const added = hides(applyEndgameVisibility(source)).filter(block => !originalHeaders.has(block.split(/\r?\n/, 1)[0]));
  assert.ok(added.length >= 10, 'targeted hidden groups exist');
  for (const block of added) {
    assert.ok(!block.split(/\r?\n/).some(line => notifications.test(line.trim())), block.split(/\r?\n/, 1)[0]);
  }
});
