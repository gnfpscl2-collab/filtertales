import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  baselineFloors, renderFilter, applyVisualPolicy, addItemLevelRange, applyCategorySounds, applyEndgameVisibility, DEFAULT_SOUNDS, validateSounds, FADED_CRISIS_FRAGMENT,
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
  { BaseType: "Hinekora's Lock", DivinePerItem: 1000 },
  { BaseType: "Perfect Jeweller's Orb", DivinePerItem: 0.34 },
];
const sourceMarker = '# BEGIN NEVERSINK (personal visual policy and optional sounds; conditions preserved)\n';
const withoutAbyssClones = text => text.replace(/^# BEGIN PERSONAL ABYSS COLOURS.*?^# END PERSONAL ABYSS COLOURS\r?\n/gms, '');
const blocks = text => [...withoutAbyssClones(text).matchAll(/^Show[^\r\n]*\r?\n(?:[ \t]+\S[^\r\n]*(?:\r?\n|$))+/gm)].map(match => match[0]);
const logic = text => withoutAbyssClones(text).split(/\r?\n/).filter(line => line.trim()
  && !/^[ \t]*(?:SetFontSize|SetTextColor|SetBorderColor|SetBackgroundColor|PlayAlertSound|CustomAlertSoundOptional|PlayEffect|MinimapIcon)\b/.test(line)).join('\n');
const render = (profile, overrides = {}) => renderFilter({
  source: sources.get(profile.sourceMode), prices, league: 'Test League', profile,
  release: config.upstream.release, dataLabel: 'test fixture; not current market data', customSounds: true, sounds: config.sounds ?? DEFAULT_SOUNDS, ...overrides,
});
const audio = block => block.match(/CustomAlertSoundOptional "sounds\/([^"\r\n]+)"/)?.[1];
const colourLines = block => block.split(/\r?\n/).filter(line => /^\s*Set(?:TextColor|BorderColor|BackgroundColor)\b/.test(line)).map(line => line.trim());
const visibilitySource = profile => profile.strictEndgame
  ? applyEndgameVisibility(sources.get(profile.sourceMode)) : sources.get(profile.sourceMode);

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
  ['tw-normal.filter', [false, true, true, true, true, true, true]],
  ['tw-hard.filter', [true, true, true, false, false, false, false]],
  ['tw-hell.filter', [true, true, true, true, true, false, false]],
]);
for (const profile of config.profiles) {
  test(`${profile.file}: default audio uses built-in sounds without custom file references`, () => {
    const text = renderFilter({
      source: sources.get(profile.sourceMode), prices, league: 'Test League', profile,
      release: config.upstream.release, dataLabel: 'native sound fixture',
    });
    assert.doesNotMatch(text, /^[ \t]*CustomAlertSound\w*\b/m);
    assert.doesNotMatch(text, /BEGIN PERSONAL TABLET SOUND|sounds\/[^"\r\n]+\.wav/);
    const [prefix, suffix] = text.split(sourceMarker);
    for (const name of ['Mirror of Kalandra', 'Divine Orb', 'Chaos Orb', 'Fracturing Orb']) {
      const rule = blocks(prefix).find(block => block.includes(`"${name}"`));
      assert.ok(rule, `${name} keeps its priority rule`);
      assert.match(rule, /PlayAlertSound [1-9][0-6]? (?:250|300)/);
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
    assert.equal(logic(recovered), logic(visibilitySource(profile)), 'native mode preserves the selected visibility policy conditions/order');
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
    assert.doesNotMatch(range, /^\s*DropLevel\b/m, 'drop level is not an equipment requirement substitute');
    for (const [index, level] of [65, 66, 78, 79, 81, 82, 83].entries()) {
      const hidden = [...range.matchAll(/ItemLevel ([<>]) (\d+)/g)].some(match =>
        match[1] === '<' ? level < Number(match[2]) : level > Number(match[2]));
      assert.equal(hidden, expectedBoundaries.get(profile.file)[index], `ordinary gear ilvl ${level}`);
    }
  });

  test(`${profile.file}: original matching conditions and order survive the requested additions`, () => {
    const source = visibilitySource(profile);
    const [prefix, suffix] = render(profile).split(sourceMarker);
    const economyWithoutMaterialGuard = prefix.replace(/^# BEGIN PERSONAL MATERIAL TIER.*?^# END PERSONAL MATERIAL TIER\r?\n/gms, '');
    const economyWithoutUserHides = economyWithoutMaterialGuard
      .replace(/^# BEGIN PERSONAL TRIAL KEY HIDE.*?^# END PERSONAL TRIAL KEY HIDE\r?\n/gms, '')
      .replace(/^# BEGIN PERSONAL GOLD HIDE.*?^# END PERSONAL GOLD HIDE\r?\n/gms, '');
    assert.doesNotMatch(economyWithoutUserHides, /^Hide\b/m, 'only the explicit fixed material, trial key and gold policies introduce hiding');
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
    assert.equal(audio(divine), '0161.wav');
    assert.match(divine, /PlayEffect Red/);
    const pinnacle = rules.find(block => block.includes('"Mirror of Kalandra"'));
    assert.ok(pinnacle.includes('"Hinekora\'s Lock"'));
    assert.match(pinnacle, /PlayEffect Red/);
    assert.equal(audio(pinnacle), '777.wav');
    const rare = rules.find(block => /Verified unit value >= 1 Divine/.test(block));
    assert.match(rare.split(/\r?\n/, 1)[0], /S\+/, 'one-Divine unit values have the agreed S+ rank');
    assert.match(divine.split(/\r?\n/, 1)[0], /S\+/, 'Divine itself has the same S+ rank');
    assert.match(rare, /"Fracturing Orb"/);
    assert.equal(audio(rare), '0161.wav');
    assert.doesNotMatch(rare, /Perfect Jeweller's Orb|Hinekora's Lock|AreaLevel|ItemLevel/);
    const chaos = rules.find(block => /BaseType == "Chaos Orb"/.test(block));
    assert.equal(audio(chaos), '0090.wav');
    assert.match(prefix, /BaseType == "Vaal Orb"/);
    assert.match(prefix, /AreaLevel >= 65/, 'lower-value visual promotion preserves campaign exceptions');
  });

  test(`${profile.file}: six active sounds follow category and exceptional priorities`, () => {
    const [, suffix] = render(profile).split(sourceMarker);
    const rules = blocks(suffix);
    const ordinary = rules.filter(block => /\$type->waystones \$tier->waystone_t(?:[1-9]|1[0-5])\b/.test(block));
    assert.equal(ordinary.length, 15);
    for (const rule of ordinary) assert.equal(audio(rule), '0398.wav');
    const specials = rules.filter(block => /\$type->waystone/.test(block)
      && /waystone_t16\b|maps_special[bc]\b/.test(block));
    assert.ok(specials.some(block => /waystone_t16\b/.test(block)), 'T16 exists as a native exception');
    for (const rule of specials) assert.equal(audio(rule), '0397.wav');
    const tablets = [...suffix.matchAll(/^# BEGIN PERSONAL TABLET SOUND.*?^# END PERSONAL TABLET SOUND/gms)].map(match => match[0]);
    const genericTablets = tablets.filter(subset => /\$type->fragments->generic/.test(subset));
    assert.equal(genericTablets.length, 2);
    for (const subset of genericTablets) {
      assert.match(subset, /Class == "Tablet"/);
      assert.equal(audio(subset), '0398.wav');
      assert.doesNotMatch(subset, /Sacred Bloom/);
    }
    const uniqueTablets = tablets.filter(subset => /Rarity Unique/.test(subset));
    const originalUniqueTablets = blocks(sources.get(profile.sourceMode)).filter(block => /Rarity Unique/.test(block)
      && /^\s*BaseType ==[^\r\n]* Tablet"/m.test(block) && !/!uniques_exceptional/.test(block));
    assert.ok(uniqueTablets.length > 0);
    assert.equal(uniqueTablets.length, originalUniqueTablets.length, 'all ordinary Unique Tablet categories receive the tablet sound');
    for (const subset of uniqueTablets) {
      const names = [...subset.match(/^\s*BaseType == ([^\r\n]+)/m)[1].matchAll(/"([^"]+)"/g)].map(match => match[1]);
      assert.ok(names.every(name => name.endsWith(' Tablet')), 'mixed non-tablet unique bases keep the original fallback');
      assert.equal(audio(subset), '0398.wav');
      assert.doesNotMatch(subset, /Rarity Normal Magic Rare/);
    }
    const exceptional = rules.filter(block => !/^\s*Continue\b/m.test(block)
      && (/\$type->exotic->(?:exceptional|state)|\$type->exoticmods|\$tier->restex/.test(block)
        || (/\$type->ut->/.test(block) && /UnidentifiedItemTier >= [3-9]/.test(block))));
    assert.ok(exceptional.length > 0);
    for (const rule of exceptional) assert.equal(audio(rule), '0397.wav');
    assert.ok(exceptional.some(block => /PlayEffect Pink/.test(block)), 'unknown item warnings survive');
    const cCurrency = rules.find(block => /\$type->currency \$tier->c\b/.test(block));
    const bCurrency = rules.find(block => /\$type->currency \$tier->b\b/.test(block));
    const unpricedS = rules.find(block => /\$type->currency \$tier->s\b/.test(block));
    assert.equal(audio(cCurrency), undefined);
    const originalC = blocks(sources.get(profile.sourceMode)).find(block => /\$type->currency \$tier->c\b/.test(block));
    assert.equal(cCurrency, originalC, 'C currency keeps the exact upstream alert, colours and effects');
    assert.equal(audio(bCurrency), '0103.wav');
    assert.equal(audio(unpricedS), '0103.wav', 'static S is not proof of a one-Divine price');
    const full = render(profile);
    assert.doesNotMatch(full, /sounds\/0011\.wav/, 'retired low-grade custom sound is never referenced');
    const used = new Set([...full.matchAll(/CustomAlertSoundOptional "sounds\/([^"\r\n]+)"/g)].map(match => match[1]));
    assert.deepEqual([...used].sort(), Object.values(DEFAULT_SOUNDS).sort());
    for (const block of rules.filter(block => /^\s*Continue\b/m.test(block))) assert.equal(audio(block), undefined);
    for (const block of rules.filter(block => /\$type->gold\b|BaseType == "Gold"/.test(block))) assert.equal(audio(block), undefined);
    const hides = [...full.matchAll(/^Hide[^\r\n]*\r?\n(?:[ \t]+\S[^\r\n]*(?:\r?\n|$))+/gm)].map(match => match[0]);
    for (const block of hides) assert.equal(audio(block), undefined);
  });
}

test('verified Chaos price at one Divine wins before the category sound', () => {
  const text = render(config.profiles[2], { prices: [{ BaseType: 'Chaos Orb', DivinePerItem: 1 }] });
  const chaos = blocks(text).filter(block => /BaseType == "Chaos Orb"/.test(block));
  assert.equal(audio(chaos[0]), '0161.wav');
  assert.equal(audio(chaos[1]), '0090.wav');
});

test('Faded Crisis Fragment is a separate S+ Pinnacle Key at one Divine in every profile', () => {
  const price = {
    BaseType: FADED_CRISIS_FRAGMENT.base_type, MetadataId: FADED_CRISIS_FRAGMENT.metadata_id,
    ItemClass: FADED_CRISIS_FRAGMENT.item_class, DivinePerItem: 1,
  };
  for (const profile of config.profiles) {
    const [prefix, suffix] = render(profile, { prices: [...prices, price] }).split(sourceMarker);
    const rule = blocks(prefix).find(block => block.includes('"Faded Crisis Fragment"'));
    assert.ok(rule, profile.file);
    assert.match(rule, /^Show # S\+ Verified unit value >= 1 Divine/m);
    assert.match(rule, /^\s*Class == "Pinnacle Keys"$/m);
    assert.doesNotMatch(rule, /Quest Items|Stackable Currency|ItemLevel|AreaLevel|RequiredLevel|DropLevel/);
    assert.equal(audio(rule), '0161.wav');
    assert.match(rule, /SetTextColor 255 0 0 255/);
    assert.match(rule, /SetBackgroundColor 255 255 255 255/);
    const range = suffix.match(/^# BEGIN PERSONAL ITEMLEVEL RANGE.*?^# END PERSONAL ITEMLEVEL RANGE/gms)?.[0];
    assert.doesNotMatch(range, /Pinnacle Keys|Quest Items/);
    const [belowPrefix, belowSuffix] = render(profile, { prices: [{ ...price, DivinePerItem: 0.999 }] }).split(sourceMarker);
    assert.doesNotMatch(belowPrefix, /Faded Crisis Fragment/, 'below one Divine does not receive a currency promotion');
    const fallback = blocks(belowSuffix).find(block => /^\s*Class == "Pinnacle Keys"$/m.test(block));
    const original = blocks(sources.get(profile.sourceMode)).find(block => /^\s*Class == "Pinnacle Keys"$/m.test(block));
    assert.ok(fallback, 'existing Pinnacle Keys fallback remains');
    assert.equal(logic(fallback), logic(original));
    assert.equal(audio(fallback), '0103.wav', 'ordinary Pinnacle Keys retain the A-category fallback sound');
  }
  for (const invalid of [
    { ...price, ItemClass: 'Quest Items' },
    { ...price, ItemClass: 'Stackable Currency' },
    { ...price, MetadataId: 'Metadata/Items/QuestItems/BurningMonolithKey2' },
    { ...price, MetadataId: undefined },
    { ...price, BaseType: 'Chaos Orb' },
  ]) assert.throws(() => render(config.profiles[0], { prices: [invalid] }), /Invalid\/unrecognized currency price/);
});

test('Unique Tablet sound subsets preserve original conditions and exceptional alerts take priority', () => {
  const mixed = [
    'Show # $type->uniques $tier->t2 !uniques_a',
    '    Rarity Unique',
    '    Class == "Tablet" "Belts"',
    '    BaseType == "Abyss Tablet" "Heavy Belt"',
    '    Identified False',
    '    ItemLevel >= 80',
    '    PlayAlertSound 1 300',
    '',
  ].join('\n');
  const transformed = applyCategorySounds(mixed);
  const [tablet, fallback] = blocks(transformed);
  assert.equal(blocks(transformed).length, 2);
  assert.equal(audio(tablet), '0398.wav');
  assert.match(tablet, /BaseType == "Abyss Tablet"\n/);
  assert.doesNotMatch(tablet, /Heavy Belt|Rarity Normal Magic Rare/);
  for (const condition of ['Rarity Unique', 'Class == "Tablet" "Belts"', 'Identified False', 'ItemLevel >= 80']) {
    assert.ok(tablet.includes(condition), `tablet subset preserves ${condition}`);
  }
  assert.equal(audio(fallback), undefined);
  assert.equal(fallback, mixed, 'ordinary unique fallback keeps its native alert');
  assert.equal(logic(fallback), logic(mixed), 'mixed non-tablet items retain the original matching rule');
  const exceptional = mixed.replace('$tier->t2 !uniques_a', '$tier->exceptional !uniques_exceptional');
  const exceptionalResult = applyCategorySounds(exceptional);
  assert.equal(blocks(exceptionalResult).length, 1);
  assert.equal(audio(exceptionalResult), '0397.wav');
  assert.doesNotMatch(exceptionalResult, /PERSONAL TABLET SOUND/);
  assert.equal(logic(exceptionalResult), logic(exceptional));
});

test('retained unique rarity tiers keep NeverSink matching, presentation and native alerts', () => {
  for (const profile of config.profiles) {
    const source = visibilitySource(profile);
    const [, suffix] = render(profile).split(sourceMarker);
    const unmodifiedFallbacks = suffix.replace(/^# BEGIN PERSONAL TABLET SOUND.*?^# END PERSONAL TABLET SOUND\r?\n/gms, '');
    const renderedRules = blocks(unmodifiedFallbacks);
    const nativeUniques = blocks(source).filter(block => /\$type->uniques\b/.test(block.split(/\r?\n/, 1)[0])
      && !/!uniques_exceptional\b|\$tier->restex\b/.test(block.split(/\r?\n/, 1)[0]));
    assert.ok(nativeUniques.some(block => /\$tier->t1\b/.test(block)), 'top unique category exists');
    assert.ok(nativeUniques.some(block => /\$tier->t3\b/.test(block)), 'lower unique category exists');
    for (const original of nativeUniques) {
      const header = original.split(/\r?\n/, 1)[0];
      assert.equal(renderedRules.find(block => block.startsWith(header)), original, `${profile.file}: ${header}`);
    }
  }
});

test('visual policy preserves all original Hide rules and applies the agreed colours', () => {
  for (const source of sources.values()) {
    const styled = applyVisualPolicy(source);
    const hides = text => [...text.matchAll(/^Hide[^\r\n]*\r?\n(?:[ \t]+\S[^\r\n]*(?:\r?\n|$))+/gm)].map(match => match[0]);
    assert.deepEqual(hides(styled), hides(source));
    const rules = blocks(styled);
    const s = rules.find(block => /\$type->currency \$tier->s\b/.test(block));
    assert.match(s, /SetTextColor 255 0 0(?: 255)?\r?\n/);
    assert.match(s, /SetBorderColor 255 0 0(?: 255)?\r?\n/);
    assert.match(s, /SetBackgroundColor 255 255 255(?: 255)?\r?\n/);
    for (const a of rules.filter(block => /\$type->currency \$tier->a\b|\$type->sockets->general \$tier->[sa]\b/.test(block))) {
      assert.match(a, /SetTextColor 255 255 255(?: 255)?\r?\n/);
      assert.match(a, /SetBorderColor 255 165 0(?: 255)?\r?\n/);
      assert.match(a, /SetBackgroundColor 255 165 0(?: 255)?\r?\n/);
    }
    const original = blocks(source);
    for (const block of rules.filter(block => /\$type->currency \$tier->[bcde]\b|\$type->endgame->normalcraft->economy|\$type->exoticbases\b/.test(block))) {
      const header = block.split(/\r?\n/, 1)[0];
      assert.deepEqual(colourLines(block), colourLines(original.find(rule => rule.startsWith(header))), 'B and lower colours follow the upstream rule');
    }
  }
});

test('pinnacle and dynamic S/A styles follow the same red/white and orange policy', () => {
  const text = render(config.profiles[0], { prices: [...prices, { BaseType: "Arcanist's Etcher", DivinePerItem: 0.2 }] });
  const [prefix] = text.split(sourceMarker);
  const rules = blocks(prefix);
  for (const rule of rules.filter(block => /pinnacle|Mirror of Kalandra|Fixed Divine Orb|Verified unit value >= 1 Divine/.test(block))) {
    assert.match(rule, /SetTextColor 255 0 0(?: 255)?\r?\n/);
    assert.match(rule, /SetBorderColor 255 0 0(?: 255)?\r?\n/);
    assert.match(rule, /SetBackgroundColor 255 255 255(?: 255)?\r?\n/);
  }
  const a = rules.find(block => block.includes('"Arcanist\'s Etcher"'));
  assert.match(a, /SetTextColor 255 255 255(?: 255)?\r?\n/);
  assert.match(a, /SetBorderColor 255 165 0(?: 255)?\r?\n/);
  assert.match(a, /SetBackgroundColor 255 165 0(?: 255)?\r?\n/);
  assert.equal(audio(a), '0103.wav');
  const sourceB = blocks(sources.get('Leveling')).find(block => /\$type->currency \$tier->b\b/.test(block));
  const dynamicB = rules.find(block => block.includes('"Vaal Orb"'));
  const chaos = rules.find(block => /BaseType == "Chaos Orb"/.test(block));
  assert.deepEqual(colourLines(dynamicB), colourLines(sourceB));
  assert.deepEqual(colourLines(chaos), colourLines(sourceB));
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
  assert.throws(() => validateSounds({ ...DEFAULT_SOUNDS, value: '../0161.wav' }), /sound/i);
  assert.throws(() => validateSounds({ ...DEFAULT_SOUNDS, value: '0161.wav\nHide' }), /sound/i);
  assert.throws(() => validateSounds({ value: '0161.wav' }), /sound/i);
});
