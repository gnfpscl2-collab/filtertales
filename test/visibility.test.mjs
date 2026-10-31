import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyEndgameVisibility, materialHideRules, renderFilter, FADED_CRISIS_FRAGMENT, ABYSS_ITEMS } from '../src/filter.mjs';

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

const abyssPrice = (name, DivinePerItem) => {
  const item = ABYSS_ITEMS.find(item => item.base_type === name);
  assert.ok(item, name);
  return { BaseType: item.base_type, MetadataId: item.metadata_id, ItemClass: item.item_class, DivinePerItem };
};
const assertAbyssColours = block => {
  assert.match(block, /^\s*SetTextColor 255 255 255 255\r?$/m);
  assert.match(block, /^\s*SetBorderColor 0 255 0 255\r?$/m);
  assert.match(block, /^\s*SetBackgroundColor 0 0 0 255\r?$/m);
};

test('every profile gives visible Abyss items white text, a green border and a black background', () => {
  const lowBones = new Set(['Gnawed Jawbone', 'Gnawed Rib', 'Gnawed Collarbone', 'Preserved Jawbone']);
  for (const profile of config.profiles) {
    for (const customSounds of [false, true]) {
      const filter = render(profile, customSounds);
      for (const item of ABYSS_ITEMS) {
        const result = firstTerminal(filter, { BaseType: item.base_type, Class: item.item_class, Rarity: 'Normal' });
        if (profile.materialTier && lowBones.has(item.base_type)) {
          assert.equal(result.action, 'Hide', `${profile.file}: ${item.base_type}`);
          assert.deepEqual(result.notificationLines, []);
          continue;
        }
        assert.equal(result.action, 'Show', `${profile.file}: ${item.base_type}`);
        assertAbyssColours(result.block);
        if (item.base_type === 'Abyss Tablet' && customSounds) assert.match(result.block, /sounds\/0398\.wav/);
      }
      const uniqueTablet = firstTerminal(filter, { BaseType: 'Abyss Tablet', Class: 'Tablet', Rarity: 'Unique' });
      assert.equal(uniqueTablet.action, 'Show');
      assertAbyssColours(uniqueTablet.block);
      if (profile.materialTier) {
        const lowBone = firstTerminal(filter, { BaseType: 'Gnawed Rib', Class: 'Stackable Currency', Rarity: 'Normal', StackSize: 20 });
        assert.equal(lowBone.action, 'Hide', 'recolouring never reveals a previously hidden low material');
        assert.deepEqual(lowBone.notificationLines, []);
      }
    }
  }
});

test('only verified one-Divine Abyss value wins over its green default and preserves the S+ sound', () => {
  for (const profile of config.profiles) {
    for (const customSounds of [false, true]) {
      for (const name of ['Omen of Light', "Amanamu's Gaze", "Kulemak's Invitation", 'Ancient Jawbone']) {
        for (const value of [0.01, 0.062, 0.1, 0.99, 1, 2]) {
          const price = abyssPrice(name, value);
          const result = firstTerminal(render(profile, customSounds, [price]), {
            BaseType: name, Class: price.ItemClass, Rarity: 'Normal',
          });
          assert.equal(result.action, 'Show');
          if (value < 1) {
            assertAbyssColours(result.block);
            assert.doesNotMatch(result.header, /Personal economy promotion|S\+ Verified/);
          } else {
            assert.match(result.header, /S\+ Verified unit value/);
            assert.match(result.block, /^\s*SetTextColor 255 0 0 255\r?$/m);
            assert.match(result.block, /^\s*SetBorderColor 255 0 0 255\r?$/m);
            assert.match(result.block, /^\s*SetBackgroundColor 255 255 255 255\r?$/m);
            if (customSounds) assert.match(result.block, /sounds\/0161\.wav/);
            else assert.doesNotMatch(result.block, /CustomAlertSound/);
          }
        }
      }
    }
  }
});

test('Abyss names do not recolour unrelated equipment, unrelated omens or same-name quest keys', () => {
  const price = abyssPrice("Kulemak's Invitation", 2);
  for (const profile of config.profiles) {
    const filter = render(profile, true, [price]);
    for (const item of [
      { BaseType: 'Abyssal Signet', Class: 'Rings', Rarity: 'Magic' },
      { BaseType: 'Omen of Chance', Class: 'Omen', Rarity: 'Normal' },
      { BaseType: "Kulemak's Invitation", Class: 'Quest Items', Rarity: 'Normal', AlwaysShow: true },
    ]) {
      const result = firstTerminal(filter, item);
      assert.equal(result.action, 'Show', JSON.stringify(item));
      assert.doesNotMatch(result.header, /S\+ Verified unit value/);
      assert.doesNotMatch(result.block, /^\s*SetBorderColor 0 255 0 255\r?$/m);
    }
  }
});

test('only hell hides ordinary Djinn Barya and Inscribed Ultimatum at every rarity and level', () => {
  for (const profile of config.profiles) {
    const filter = render(profile);
    for (const ItemLevel of [20, 65, 80, 90]) {
      for (const Rarity of rarities) {
        for (const [BaseType, Class] of [['Djinn Barya', 'Trial Coins'], ['Inscribed Ultimatum', 'Inscribed Ultimatum']]) {
          const result = firstTerminal(filter, { BaseType, Class, Rarity, ItemLevel });
          assert.equal(result.action, profile.strictEndgame ? 'Hide' : 'Show', `${profile.file}: ${BaseType}, ${Rarity}, ilvl ${ItemLevel}`);
          if (profile.strictEndgame) assert.deepEqual(result.notificationLines, [], 'hidden trial keys carry no alert, beam or icon');
        }
      }
    }
    for (const BaseType of ['Test of Cunning Barya', 'Test of Strength Barya', 'Test of Time Barya', 'Test of Will Barya']) {
      assert.equal(firstTerminal(filter, { BaseType, Class: 'Trial Coins', Rarity: 'Normal' }).action, 'Show', BaseType);
    }
  }
});

test('Abyss price rules reject spoofed classes, metadata identifiers and quest variants', () => {
  const invitation = abyssPrice("Kulemak's Invitation", 2);
  const omen = abyssPrice('Omen of Light', 2);
  for (const price of [
    { ...invitation, ItemClass: 'Quest Items' },
    { ...invitation, MetadataId: 'Metadata/Items/QuestItems/Abyss/AbyssPinnacleKeyQuest' },
    { ...invitation, ItemClass: 'Pinnacle Keys' },
    { ...omen, MetadataId: 'Metadata/Items/Currency/CurrencyModValues' },
    { ...omen, ItemClass: 'Stackable Currency' },
    { ...omen, BaseType: 'Omen of Chance' },
  ]) assert.throws(() => render(config.profiles[0], true, [price]), /Invalid\/unrecognized currency price/);
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

test('low runes, essences and selected material names are hidden while higher materials remain', () => {
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
    ['Liquid Envy', 'Stackable Currency'],
    ['Unlisted Rune', 'Augment'], ['Essence of a Future Mechanic', 'Stackable Currency'],
  ]) assert.equal(firstTerminal(filter, { BaseType, Class, Rarity: 'Normal' }).action, 'Show', BaseType);
});

test('hard and hell hide lower crafting currency and materials regardless of stack or campaign exceptions', () => {
  for (const profile of config.profiles.slice(1)) {
    const filter = render(profile);
    for (const AreaLevel of [1, 64, 82]) {
      for (const StackSize of [1, 4, 20]) {
        for (const BaseType of [
          'Regal Shard', 'Alchemy Shard', "Artificer's Shard", 'Regal Orb', 'Orb of Alchemy',
          'Orb of Transmutation', 'Orb of Augmentation', 'Exalted Orb', 'Vaal Orb',
          "Armourer's Scrap", "Blacksmith's Whetstone", "Artificer's Orb", "Lesser Jeweller's Orb",
          "Gemcutter's Prism", "Glassblower's Bauble", "Arcanist's Etcher", 'Chance Shard',
          'Greater Essence of Haste', 'Essence of Haste', 'Adaptive Catalyst', 'Diluted Liquid Greed',
        ]) {
          const result = firstTerminal(filter, { BaseType, Class: 'Stackable Currency', Rarity: 'Normal', AreaLevel, StackSize });
          assert.equal(result.action, 'Hide', `${profile.file}: ${BaseType}, stack ${StackSize}, area ${AreaLevel}`);
          assert.deepEqual(result.notificationLines, [], `${BaseType}: no sound, beam or icon`);
        }
      }
    }
    for (const BaseType of ['Greater Adept Rune', 'Greater Body Rune', 'Ancient Rune of Animosity']) {
      assert.equal(firstTerminal(filter, { BaseType, Class: 'Augment', Rarity: 'Normal', AreaLevel: 1 }).action, 'Hide', BaseType);
    }
    for (const BaseType of ['Gnawed Collarbone', 'Gnawed Jawbone', 'Gnawed Rib']) {
      assert.equal(firstTerminal(filter, { BaseType, Class: 'Incubators', Rarity: 'Normal' }).action, 'Hide', BaseType);
    }
  }
  assert.equal(firstTerminal(render(config.profiles[0]), { BaseType: 'Regal Shard', Class: 'Stackable Currency', Rarity: 'Normal' }).action, 'Show');
});

test('hard keeps Greater crafting orbs while hell starts at Greater Exalted and protects major currency', () => {
  const hard = render(config.profiles[1]);
  const hell = render(config.profiles[2]);
  for (const BaseType of ['Greater Regal Orb', "Greater Jeweller's Orb", 'Greater Orb of Transmutation', 'Greater Orb of Augmentation',
    'Perfect Orb of Transmutation', 'Perfect Orb of Augmentation']) {
    const item = { BaseType, Class: 'Stackable Currency', Rarity: 'Normal' };
    assert.equal(firstTerminal(hard, item).action, 'Show', BaseType);
    assert.equal(firstTerminal(hell, item).action, 'Hide', BaseType);
  }
  for (const profile of config.profiles.slice(1)) {
    const filter = render(profile);
    for (const BaseType of ['Greater Exalted Orb', 'Greater Chaos Orb', 'Perfect Regal Orb', 'Perfect Exalted Orb',
      'Chaos Orb', 'Divine Orb', 'Mirror of Kalandra', "Hinekora's Lock", 'Orb of Annulment', 'Orb of Chance',
      'Essence of Hysteria', 'Essence of Horror', 'Essence of Insanity', 'Reaver Catalyst', 'Liquid Envy']) {
      assert.equal(firstTerminal(filter, { BaseType, Class: 'Stackable Currency', Rarity: 'Normal' }).action, 'Show', BaseType);
    }
  }
});

test('material cutoff precedes lower economy promotions but verified one-Divine items keep S+ priority', () => {
  for (const profile of config.profiles.slice(1)) {
    for (const customSounds of [false, true]) {
      const lower = render(profile, customSounds, [{ BaseType: 'Vaal Orb', DivinePerItem: 0.2 }, { BaseType: 'Regal Orb', DivinePerItem: 0.02 }]);
      for (const BaseType of ['Vaal Orb', 'Regal Orb']) {
        const item = { BaseType, Class: 'Stackable Currency', Rarity: 'Normal' };
        assert.equal(firstTerminal(lower, item).action, 'Hide', BaseType);
        const high = firstTerminal(render(profile, customSounds, [{ BaseType, DivinePerItem: 1 }]), item);
        assert.equal(high.action, 'Show');
        assert.match(high.header, /S\+ Verified unit value/);
        if (customSounds) assert.match(high.block, /sounds\/0161\.wav/);
      }
      for (const item of [
        { BaseType: 'Waystone', Class: 'Waystones', Rarity: 'Magic', WaystoneTier: 15 },
        { BaseType: 'Expedition Tablet', Class: 'Tablet', Rarity: 'Rare' },
        { BaseType: 'Faded Crisis Fragment', Class: 'Pinnacle Keys', Rarity: 'Normal' },
        { BaseType: 'Regal Shard', Class: 'Quest Items', Rarity: 'Normal', AlwaysShow: true },
      ]) assert.equal(firstTerminal(lower, item).action, 'Show', JSON.stringify(item));
    }
  }
  for (const preset of ['greater', 'greater-exalted']) {
    assert.throws(() => materialHideRules('Show\n    BaseType == "Regal Shard"\n', preset), /missing|changed|source|group|anchor/i);
  }
  assert.throws(() => materialHideRules(source, 'everything'), /material|preset|tier/i);
});

test('only hell hides uncut skill and spirit gems below gem level 19 without changing support gems', () => {
  for (const customSounds of [false, true]) {
    for (const profile of config.profiles) {
      const filter = render(profile, customSounds);
      for (const [BaseType, Class] of [['Uncut Skill Gem', 'Uncut Skill Gems'], ['Uncut Spirit Gem', 'Uncut Spirit Gems']]) {
        for (const AreaLevel of [1, 64, 82]) {
          for (const GemLevel of [1, 18, 19, 20, 21]) {
            const result = firstTerminal(filter, { BaseType, Class, Rarity: 'Normal', GemLevel, AreaLevel, ItemLevel: 1 });
            assert.equal(result.action, profile.strictEndgame && GemLevel < 19 ? 'Hide' : 'Show', `${profile.file}: ${BaseType} level ${GemLevel}, area ${AreaLevel}`);
            if (result.action === 'Hide') assert.deepEqual(result.notificationLines, []);
          }
        }
        assert.equal(firstTerminal(filter, { BaseType, Class, Rarity: 'Normal', GemLevel: 18, ItemLevel: 90 }).action,
          profile.strictEndgame ? 'Hide' : 'Show', 'gem level is independent of item level');
      }
      assert.equal(firstTerminal(filter, { BaseType: 'Uncut Support Gem', Class: 'Uncut Support Gems', Rarity: 'Normal', GemLevel: 1 }).action, 'Show');
    }
  }
});

test('hard and hell hide every gold pile while normal retains its original display in both audio modes', () => {
  for (const customSounds of [false, true]) {
    for (const profile of config.profiles) {
      const filter = render(profile, customSounds);
      for (const AreaLevel of [1, 64, 82]) {
        for (const StackSize of [1, 99, 650, 2000, 5000, 1000000]) {
          const result = firstTerminal(filter, { BaseType: 'Gold', Class: 'Gold', Rarity: 'Normal', AreaLevel, StackSize });
          assert.equal(result.action, profile.sourceMode === 'Endgame' ? 'Hide' : 'Show', `${profile.file}: ${StackSize} gold, area ${AreaLevel}`);
          if (result.action === 'Hide') assert.deepEqual(result.notificationLines, []);
        }
      }
    }
  }
});

test('strict rules spare non-equipment and verified high-value prefixes in both audio modes', () => {
  const fragment = { BaseType: FADED_CRISIS_FRAGMENT.base_type, MetadataId: FADED_CRISIS_FRAGMENT.metadata_id,
    ItemClass: FADED_CRISIS_FRAGMENT.item_class, DivinePerItem: 2 };
  for (const customSounds of [false, true]) {
    const filter = render(config.profiles[2], customSounds, [fragment, { BaseType: 'Vaal Orb', DivinePerItem: 2 }]);
    for (const item of [
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
