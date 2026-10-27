import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  baselineFloors, renderFilter, applyVisualPolicy, addItemLevelRange, applyCategorySounds,
} from '../src/filter.mjs';

const root = new URL('../', import.meta.url);
const config = JSON.parse(readFileSync(new URL('config.json', root), 'utf8'));
const sources = new Map(config.upstream.files.map(entry => [
  entry.mode, readFileSync(new URL(`upstream/${entry.file}`, root), 'utf8'),
]));
const prices = [
  { BaseType: 'Divine Orb', DivinePerItem: 0.01 },
  { BaseType: 'Chaos Orb', DivinePerItem: 0.2 },
  { BaseType: 'Vaal Orb', DivinePerItem: 0.02 },
  { BaseType: 'Fracturing Orb', DivinePerItem: 2 },
  { BaseType: "Perfect Jeweller's Orb", DivinePerItem: 0.34 },
];
const sourceMarker = '# BEGIN NEVERSINK (personal visual policy and optional sounds; conditions preserved)\n';
const blocks = text => [...text.matchAll(/^Show[^\r\n]*\r?\n(?:[ \t]+\S[^\r\n]*(?:\r?\n|$))+/gm)].map(match => match[0]);
const logic = text => text.split(/\r?\n/).filter(line => line.trim()
  && !/^[ \t]*(?:SetFontSize|SetTextColor|SetBorderColor|SetBackgroundColor|PlayAlertSound|CustomAlertSoundOptional|PlayEffect|MinimapIcon)\b/.test(line)).join('\n');
const render = (profile, overrides = {}) => renderFilter({
  source: sources.get(profile.sourceMode), prices, league: 'Test League', profile,
  release: config.upstream.release, dataLabel: 'test fixture; not current market data', customSounds: true, ...overrides,
});

test('pinned upstream bytes and top currency floors remain intact', () => {
  assert.equal(config.profiles.length, 3);
  for (const entry of config.upstream.files) {
    const bytes = readFileSync(new URL(`upstream/${entry.file}`, root));
    assert.equal(createHash('sha256').update(bytes).digest('hex').toUpperCase(), entry.sha256);
    const floors = baselineFloors(sources.get(entry.mode));
    assert.equal(floors.get('Divine Orb'), 3);
    assert.equal(floors.get('Mirror of Kalandra'), 3);
    assert.equal(floors.get("Hinekora's Lock"), 3);
    assert.equal(floors.get('Chaos Orb'), 1);
  }
});

const expectedBoundaries = new Map([
  ['Personal-01-ILvl-1-79.filter', [false, true, true, true]],
  ['Personal-02-ILvl-80-81.filter', [true, false, false, true]],
  ['Personal-03-Endgame-ILvl-81plus.filter', [true, true, false, false]],
]);
for (const profile of config.profiles) {
  test(`${profile.file}: default audio uses built-in sounds without custom file references`, () => {
    const text = renderFilter({
      source: sources.get(profile.sourceMode), prices, league: 'Test League', profile,
      release: config.upstream.release, dataLabel: 'native sound fixture',
    });
    assert.doesNotMatch(text, /^[ \t]*CustomAlertSound\w*\b/m);
    assert.doesNotMatch(text, /BEGIN PERSONAL TABLET SOUND|sounds\/tw-/);
    const [prefix, suffix] = text.split(sourceMarker);
    for (const name of ['Mirror of Kalandra', 'Divine Orb', 'Chaos Orb', 'Fracturing Orb']) {
      const rule = blocks(prefix).find(block => block.includes(`"${name}"`));
      assert.ok(rule, `${name} keeps its priority rule`);
      assert.match(rule, /PlayAlertSound [1-9][0-6]? 250/);
    }
    const customRange = render(profile).match(/^# BEGIN PERSONAL ITEMLEVEL RANGE.*?^# END PERSONAL ITEMLEVEL RANGE\r?\n/ms)?.[0];
    const nativeRange = suffix.match(/^# BEGIN PERSONAL ITEMLEVEL RANGE.*?^# END PERSONAL ITEMLEVEL RANGE\r?\n/ms)?.[0];
    assert.equal(nativeRange, customRange, 'audio mode does not alter gear boundaries');
    const sourceRules = blocks(sources.get(profile.sourceMode));
    const ordinary = blocks(suffix).filter(block => /\$type->waystones \$tier->waystone_t(?:[1-9]|1[0-5])\b/.test(block));
    assert.equal(ordinary.length, 15);
    for (const rule of ordinary) {
      const header = rule.split(/\r?\n/, 1)[0];
      const original = sourceRules.find(block => block.startsWith(header));
      assert.equal(rule.match(/^[ \t]*PlayAlertSound[^\r\n]*/m)?.[0], original.match(/^[ \t]*PlayAlertSound[^\r\n]*/m)?.[0]);
    }
    const recovered = suffix.replace(/^# BEGIN PERSONAL ITEMLEVEL RANGE.*?^# END PERSONAL ITEMLEVEL RANGE\r?\n/gms, '');
    assert.equal(logic(recovered), logic(sources.get(profile.sourceMode)), 'native mode preserves original conditions/order');
  });

  test(`${profile.file}: only ordinary gear uses the agreed level boundaries`, () => {
    const text = render(profile);
    const [, suffix] = text.split(sourceMarker);
    assert.ok(suffix);
    const range = suffix.match(/^# BEGIN PERSONAL ITEMLEVEL RANGE.*?^# END PERSONAL ITEMLEVEL RANGE\r?\n/ms)?.[0];
    assert.ok(range, 'range rules exist');
    assert.match(range, /Rarity Normal Magic Rare/);
    const classes = range.match(/Class == ([^\r\n]+)/)?.[1];
    assert.equal([...classes.matchAll(/"([^"]+)"/g)].length, 21);
    for (const name of ['Body Armours', 'Wands', 'Rings', 'Amulets']) assert.ok(classes.includes(`"${name}"`));
    assert.doesNotMatch(range, /"(?:Tablet|Waystones|Stackable Currency|Jewels|Quest Items)"|Unique/);
    assert.ok(suffix.indexOf('# BEGIN PERSONAL ITEMLEVEL RANGE') > suffix.lastIndexOf('# [[0800]]'));
    assert.ok(suffix.indexOf('# BEGIN PERSONAL ITEMLEVEL RANGE') < suffix.lastIndexOf('# [[0900]]'));
    assert.doesNotMatch(text, /^\s*RequiredLevel\b/m);
    for (const [index, level] of [79, 80, 81, 82].entries()) {
      const hidden = [...range.matchAll(/ItemLevel ([<>]) (\d+)/g)].some(match =>
        match[1] === '<' ? level < Number(match[2]) : level > Number(match[2]));
      assert.equal(hidden, expectedBoundaries.get(profile.file)[index], `ordinary gear ilvl ${level}`);
    }
  });

  test(`${profile.file}: original matching conditions and order survive the requested additions`, () => {
    const source = sources.get(profile.sourceMode);
    const [prefix, suffix] = render(profile).split(sourceMarker);
    assert.doesNotMatch(prefix, /^Hide\b/m, 'economy never introduces price-based hiding');
    const recovered = suffix
      .replace(/^# BEGIN PERSONAL ITEMLEVEL RANGE.*?^# END PERSONAL ITEMLEVEL RANGE\r?\n/gms, '')
      .replace(/^# BEGIN PERSONAL TABLET SOUND.*?^# END PERSONAL TABLET SOUND\r?\n/gms, '');
    assert.equal(logic(recovered), logic(source));
    assert.doesNotMatch(suffix, /personal-(?:top|high|mid)\.wav/, 'no previous global sound remapping');
  });

  test(`${profile.file}: sound threshold is independent of the original S rank`, () => {
    const [prefix] = render(profile).split(sourceMarker);
    const rules = blocks(prefix);
    const divine = rules.find(block => /BaseType == "Divine Orb"/.test(block));
    assert.match(divine, /tw-rare-drop\.wav/);
    assert.match(divine, /PlayEffect Orange/);
    const mirror = rules.find(block => /BaseType == "Mirror of Kalandra"/.test(block));
    assert.match(mirror, /PlayEffect Red/);
    assert.match(mirror, /tw-rare-drop\.wav/);
    const rare = rules.find(block => /Verified unit value >= 1 Divine/.test(block));
    assert.match(rare, /"Fracturing Orb"/);
    assert.match(rare, /tw-rare-drop\.wav/);
    assert.doesNotMatch(rare, /Perfect Jeweller's Orb|AreaLevel|ItemLevel/);
    const chaos = rules.find(block => /BaseType == "Chaos Orb"/.test(block));
    assert.match(chaos, /tw-level-up\.wav/);
    assert.match(prefix, /BaseType == "Vaal Orb"/);
    assert.match(prefix, /AreaLevel >= 65/, 'lower-value visual promotion preserves campaign exceptions');
  });

  test(`${profile.file}: ordinary map/tablet sounds do not affect exceptional drops`, () => {
    const [, suffix] = render(profile).split(sourceMarker);
    const rules = blocks(suffix);
    const ordinary = rules.filter(block => /\$type->waystones \$tier->waystone_t(?:[1-9]|1[0-5])\b/.test(block));
    assert.equal(ordinary.length, 15);
    for (const rule of ordinary) assert.match(rule, /tw-quest-reward\.wav/);
    const specials = rules.filter(block => /\$type->waystone/.test(block)
      && !/waystone_t(?:[1-9]|1[0-5])\b/.test(block));
    assert.ok(specials.some(block => /waystone_t16\b/.test(block)), 'T16 exists as a native exception');
    for (const rule of specials) assert.doesNotMatch(rule, /CustomAlertSound/);
    const tablets = [...suffix.matchAll(/^# BEGIN PERSONAL TABLET SOUND.*?^# END PERSONAL TABLET SOUND/gms)];
    assert.equal(tablets.length, 2);
    for (const [subset] of tablets) {
      assert.match(subset, /Class == "Tablet"/);
      assert.match(subset, /Rarity Normal Magic Rare/);
      assert.match(subset, /tw-level-up\.wav/);
      assert.doesNotMatch(subset, /Sacred Bloom/);
    }
    const native = rules.filter(block => /\$type->exotic->(?:exceptional|state)|\$type->exoticmods|\$type->ut->|\$tier->restex/.test(block));
    assert.ok(native.length > 0);
    for (const rule of native) assert.doesNotMatch(rule, /CustomAlertSound/);
    assert.ok(native.some(block => /PlayEffect Pink/.test(block)), 'unknown item warnings survive');
  });
}

test('verified Chaos price at one Divine wins before the category sound', () => {
  const text = render(config.profiles[2], { prices: [{ BaseType: 'Chaos Orb', DivinePerItem: 1 }] });
  const chaos = blocks(text).filter(block => /BaseType == "Chaos Orb"/.test(block));
  assert.match(chaos[0], /tw-rare-drop\.wav/);
  assert.match(chaos[1], /tw-level-up\.wav/);
});

test('visual policy preserves all original Hide rules and applies the agreed colours', () => {
  for (const source of sources.values()) {
    const styled = applyVisualPolicy(source);
    const hides = text => [...text.matchAll(/^Hide[^\r\n]*\r?\n(?:[ \t]+\S[^\r\n]*(?:\r?\n|$))+/gm)].map(match => match[0]);
    assert.deepEqual(hides(styled), hides(source));
    const rules = blocks(styled);
    assert.match(rules.find(block => /\$type->currency \$tier->s\b/.test(block)), /SetTextColor 255 215 80[\s\S]*PlayEffect Orange/);
    assert.match(rules.find(block => /\$type->sockets->general \$tier->s\b/.test(block)), /MinimapIcon 1 Purple Diamond/);
    assert.match(rules.find(block => /\$type->endgame->normalcraft->economy/.test(block)), /SetBorderColor 70 150 255/);
    const soundOnly = applyCategorySounds(source)
      .replace(/^# BEGIN PERSONAL TABLET SOUND.*?^# END PERSONAL TABLET SOUND\r?\n/gms, '')
      .replace(/^[ \t]*CustomAlertSoundOptional[^\r\n]*\r?\n/gm, '');
    assert.equal(soundOnly, source, 'category sound edits can be removed without altering original bytes');
  }
});

test('invalid ranges, changed anchors, malformed prices and header injection fail closed', () => {
  const source = sources.get('Leveling');
  for (const [min, max] of [[81, 80], [0, 79], [80, -1], [80.5, 81]]) {
    assert.throws(() => addItemLevelRange(source, min, max), /Invalid personal item-level range/);
  }
  assert.throws(() => addItemLevelRange(source.replaceAll('# [[0900]] Endgame Flasks', '# Missing'), 80, 81), /marker missing/);
  assert.throws(() => baselineFloors('Show\n    BaseType "Gold"\n'), /currency section changed/);
  assert.throws(() => render(config.profiles[0], { league: 'Test\nHide' }), /Invalid filter header/);
  assert.throws(() => render(config.profiles[0], { prices: [{ BaseType: 'Chaos Orb', DivinePerItem: NaN }] }), /Invalid\/unrecognized currency price/);
  assert.throws(() => render(config.profiles[0], { prices: [{ BaseType: 'Unknown Currency', DivinePerItem: 1 }] }), /Invalid\/unrecognized currency price/);
});
