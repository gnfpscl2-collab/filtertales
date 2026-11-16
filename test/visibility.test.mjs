import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getPrices, CHAOS, DIVINE } from '../src/economy.mjs';
import { applyEndgameVisibility, applySelectiveLoot, materialHideRules, renderFilter, FADED_CRISIS_FRAGMENT, ABYSS_ITEMS, LEAGUE_ITEMS } from '../src/filter.mjs';

const root = new URL('../', import.meta.url);
const config = JSON.parse(readFileSync(new URL('config.json', root), 'utf8'));
const regularProfiles = config.profiles.filter(profile => !profile.selectiveLoot);
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
  for (const match of filter.matchAll(/^(Show|Hide)[^\r\n]*(?:\r?\n[ \t]+\S[^\r\n]*)*/gm)) {
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

const exchangePrice = (item, DivinePerItem, ChaosPerItem) => ({ BaseType: item.base_type,
  ItemClass: item.item_class ?? 'Stackable Currency', MetadataId: item.metadata_id, DivinePerItem,
  ...(item.gem_level === undefined ? {} : { GemLevel: item.gem_level }),
  ...(ChaosPerItem === undefined ? {} : { ChaosPerItem }),
});
const exchangeDrop = item => ({ BaseType: item.base_type, Class: item.item_class ?? 'Stackable Currency',
  Rarity: 'Normal', ...(item.gem_level === undefined ? {} : { GemLevel: item.gem_level }) });

const abyssPrice = (name, DivinePerItem) => {
  const item = ABYSS_ITEMS.find(item => item.base_type === name);
  assert.ok(item, name);
  return { BaseType: item.base_type, MetadataId: item.metadata_id, ItemClass: item.item_class, DivinePerItem };
};
const assertAbyssColours = block => {
  assert.match(block, /^\s*SetTextColor 0 255 0 255\r?$/m);
  assert.match(block, /^\s*SetBorderColor 0 255 0 255\r?$/m);
  assert.match(block, /^\s*SetBackgroundColor 255 255 0 255\r?$/m);
};

test('verified one-Divine league consumables use S+ without repricing quest items or equipment', () => {
  const prices = LEAGUE_ITEMS.map(item => exchangePrice(item, 1));
  const questVariants = [...new Map(LEAGUE_ITEMS.map(item => [item.item_class, item])).values()];
  const equipment = [
    { BaseType: 'Crude Bow', Class: 'Bows', Rarity: 'Magic' },
    { BaseType: 'Ashen Wand', Class: 'Wands', Rarity: 'Magic' },
    { BaseType: 'Conjurer Mantle', Class: 'Body Armours', UnidentifiedItemTier: 3 },
    { BaseType: 'Armoured Cap', Class: 'Helmets', Rarity: 'Unique' },
    { BaseType: 'Ruby', Class: 'Jewels', Rarity: 'Unique' },
    { BaseType: 'Amethyst Ring', Class: 'Rings', Rarity: 'Unique' },
    { BaseType: 'Breach Ring', Class: 'Rings', Rarity: 'Magic' },
    { BaseType: 'Gold Amulet', Class: 'Amulets', Rarity: 'Unique' },
    { BaseType: 'Heavy Belt', Class: 'Belts', Rarity: 'Unique' },
  ];
  for (const profile of config.profiles) {
    for (const customSounds of [false, true]) {
      const high = render(profile, customSounds, prices);
      const baseline = render(profile, customSounds, []);
      for (const item of LEAGUE_ITEMS) {
        const result = firstTerminal(high, exchangeDrop(item));
        const label = `${profile.file}: ${item.base_type}`;
        assert.equal(result.action, 'Show', label);
        assert.match(result.header, /S\+ Verified unit value/, label);
        assert.match(result.block, /^\s*SetTextColor 255 0 0 255\r?$/m);
        assert.match(result.block, /^\s*SetBorderColor 255 0 0 255\r?$/m);
        assert.match(result.block, /^\s*SetBackgroundColor 255 255 255 255\r?$/m);
        assert.match(result.block, /^\s*PlayAlertSound 1 250\r?$/m);
        if (customSounds) assert.match(result.block, /CustomAlertSoundOptional "sounds\/0161\.wav" 250/);
        else assert.doesNotMatch(result.block, /CustomAlertSound/);
      }
      for (const item of questVariants) {
        const result = firstTerminal(high, { BaseType: item.base_type, Class: 'Quest Items', Rarity: 'Normal' });
        assert.doesNotMatch(result.header, /S\+ Verified unit value/, `${item.base_type}: same-name quest variant`);
      }
      for (const item of equipment) {
        assert.deepEqual(firstTerminal(high, item), firstTerminal(baseline, item), JSON.stringify(item));
      }
      for (const DivinePerItem of [0.999, 0.1]) {
        const lower = prices.map(price => ({ ...price, DivinePerItem }));
        assert.equal(render(profile, customSounds, lower), baseline, `${profile.file}: no lower-value league promotion`);
      }
    }
  }
});

test('first matching rules apply shared custom sounds to tablets, waystones and unique items', () => {
  const cases = [];
  for (const BaseType of ['Abyss Tablet', 'Breach Tablet', 'Delirium Tablet', 'Expedition Tablet',
    'Irradiated Tablet', 'Overseer Tablet', 'Ritual Tablet', 'Temple Tablet']) {
    for (const Rarity of ['Normal', 'Magic', 'Rare']) {
      cases.push([{ BaseType, Class: 'Tablet', Rarity }, '0398.wav']);
    }
  }
  for (const BaseType of ['Abyss Tablet', 'Breach Tablet']) {
    cases.push([{ BaseType, Class: 'Tablet', Rarity: 'Unique' }, '0398.wav']);
  }
  for (const WaystoneTier of [1, 15, 16]) {
    for (const Rarity of ['Normal', 'Magic', 'Rare']) {
      cases.push([{ BaseType: 'Waystone', Class: 'Waystones', Rarity, WaystoneTier },
        WaystoneTier === 16 ? '0397.wav' : '0398.wav']);
    }
  }
  cases.push(
    [{ BaseType: 'Heavy Belt', Class: 'Belts', Rarity: 'Unique', TwiceCorrupted: true }, '0397.wav'],
    [{ BaseType: 'Heavy Belt', Class: 'Belts', Rarity: 'Unique', HasVaalUniqueMod: true }, '0397.wav'],
    [{ BaseType: 'Heavy Belt', Class: 'Belts', Rarity: 'Unique' }, '0103.wav'],
  );
  for (const BaseType of ['Emerald', 'Ruby', 'Sapphire', 'Diamond', 'Timeless Jewel', 'Time-Lost Diamond']) {
    cases.push([{ BaseType, Class: 'Jewels', Rarity: 'Unique' }, '0103.wav']);
    // Pinned NeverSink T1/T2 rules precede its exceptional unique rules.
    for (const state of ['TwiceCorrupted', 'HasVaalUniqueMod']) {
      cases.push([{ BaseType, Class: 'Jewels', Rarity: 'Unique', [state]: true }, '0103.wav']);
    }
  }
  for (const [BaseType, Class] of [['Gold Ring', 'Rings'], ['Gold Amulet', 'Amulets'],
    ['Stellar Amulet', 'Amulets'], ['Utility Belt', 'Belts']]) {
    cases.push([{ BaseType, Class, Rarity: 'Unique' }, '0103.wav']);
    for (const state of ['TwiceCorrupted', 'HasVaalUniqueMod']) {
      cases.push([{ BaseType, Class, Rarity: 'Unique', [state]: true }, '0397.wav']);
    }
  }
  for (const profile of regularProfiles) {
    const filter = render(profile, true, []);
    for (const [item, sound] of cases) {
      const result = firstTerminal(filter, item);
      const label = `${profile.file}: ${JSON.stringify(item)}`;
      assert.equal(result.action, 'Show', label);
      assert.equal(result.block.match(/CustomAlertSoundOptional "sounds\/([^"\r\n]+)"/)?.[1], sound, label);
    }
    assert.doesNotMatch(render(profile, false, []), /^\s*CustomAlertSound\w*\b/m);
  }
});

test('non-selective profiles give visible Abyss items green text, a green border and a yellow background', () => {
  const lowBones = new Set(['Gnawed Jawbone', 'Gnawed Rib', 'Gnawed Collarbone', 'Preserved Jawbone']);
  for (const profile of regularProfiles) {
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
  for (const profile of regularProfiles) {
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
  for (const profile of regularProfiles) {
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
      assert.equal(firstTerminal(filter, { BaseType, Class: 'Trial Coins', Rarity: 'Normal' }).action, profile.selectiveLoot ? 'Hide' : 'Show', BaseType);
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

test('strict endgame hides untiered and tier-one ordinary gear before broad upstream Show rules', () => {
  const filter = render();
  for (const item of [
    { Rarity: 'Magic' },
    { Rarity: 'Magic', ItemLevel: 90 },
    { BaseType: 'Conjurer Mantle', Class: 'Body Armours', UnidentifiedItemTier: 1 },
    { BaseType: 'Conjurer Mantle', Class: 'Body Armours', UnidentifiedItemTier: 1, ItemLevel: 81 },
    { BaseType: 'Conjurer Mantle', Class: 'Body Armours', UnidentifiedItemTier: 3, ItemLevel: 81 },
    { UnidentifiedItemTier: 1 },
    { Identified: true },
    { BaseType: 'Amethyst Ring', Class: 'Rings', UnidentifiedItemTier: 1, ItemLevel: 79 },
  ]) {
    const result = firstTerminal(filter, item);
    assert.equal(result.action, 'Hide', JSON.stringify(item));
    assert.deepEqual(result.notificationLines, [], 'hidden gear inherits no sound, beam or minimap icon');
  }
  for (const item of [
    { BaseType: 'Conjurer Mantle', Class: 'Body Armours', UnidentifiedItemTier: 2 },
    { BaseType: 'Conjurer Mantle', Class: 'Body Armours', UnidentifiedItemTier: 3 },
    { BaseType: 'Conjurer Mantle', Class: 'Body Armours', UnidentifiedItemTier: 4 },
    { UnidentifiedItemTier: 4 },
    { UnidentifiedItemTier: 5 },
    { BaseType: 'Amethyst Ring', Class: 'Rings', UnidentifiedItemTier: 2, ItemLevel: 80 },
    { BaseType: 'Amethyst Ring', Class: 'Rings', UnidentifiedItemTier: 3 },
  ]) assert.equal(firstTerminal(filter, item).action, 'Show', JSON.stringify(item));
});

test('hell ordinary gear requires item level eighty-two and an unidentified tier of at least two', () => {
  const classes = ['Body Armours', 'Boots', 'Bows', 'Bucklers', 'Crossbows', 'Foci',
    'Gloves', 'Helmets', 'One Hand Maces', 'Quarterstaves', 'Quivers', 'Sceptres', 'Shields',
    'Spears', 'Staves', 'Talismans', 'Two Hand Maces', 'Wands'];
  const boundaries = [
    [{ ItemLevel: 90, UnidentifiedItemTier: 1, Identified: false }, 'Hide'],
    [{ ItemLevel: 81, UnidentifiedItemTier: 2, Identified: false }, 'Hide'],
    [{ ItemLevel: 82, UnidentifiedItemTier: 2, Identified: false }, 'Show'],
    [{ ItemLevel: 20, UnidentifiedItemTier: 5, Identified: false }, 'Hide'],
    [{ ItemLevel: 90, UnidentifiedItemTier: 5, Identified: false }, 'Show'],
    [{ ItemLevel: 90, UnidentifiedItemTier: 2, Identified: true }, 'Hide'],
  ];
  for (const customSounds of [false, true]) {
    const filter = render(config.profiles[2], customSounds);
    for (const Class of classes) {
      for (const Rarity of ['Magic', 'Rare']) {
        for (const [boundary, expected] of boundaries) {
          for (const AreaLevel of [1, 82]) {
            const item = { BaseType: 'Unlisted Future Equipment', Class, Rarity, AreaLevel, ...boundary };
            const result = firstTerminal(filter, item);
            assert.equal(result.action, expected, JSON.stringify(item));
            if (expected === 'Hide') assert.deepEqual(result.notificationLines, []);
          }
        }
      }
      assert.equal(firstTerminal(filter, { BaseType: 'Unlisted Future Equipment', Class,
        Rarity: 'Normal', ItemLevel: 90, UnidentifiedItemTier: 0 }).action, 'Hide');
    }
    const nativeSelection = render({ ...config.profiles[2], strictEndgame: false }, customSounds);
    for (const item of [
      { BaseType: 'Conjurer Mantle', Class: 'Body Armours', UnidentifiedItemTier: 2 },
      { BaseType: 'Conjurer Mantle', Class: 'Body Armours', UnidentifiedItemTier: 3, ItemLevel: 82 },
      { BaseType: 'Conjurer Mantle', Class: 'Body Armours', UnidentifiedItemTier: 4 },
      { BaseType: 'Amethyst Ring', Class: 'Rings', UnidentifiedItemTier: 2, ItemLevel: 80 },
    ]) {
      assert.deepEqual(firstTerminal(filter, item).notificationLines,
        firstTerminal(nativeSelection, item).notificationLines, 'existing tier alerts keep their priority');
    }
  }
});

test('hell ordinary rings, amulets and jewels start at item level eighty without changing unique policies', () => {
  for (const customSounds of [false, true]) {
    const filter = render(config.profiles[2], customSounds);
    for (const [BaseType, Class] of [['Amethyst Ring', 'Rings'], ['Amber Amulet', 'Amulets'],
      ['Emerald', 'Jewels'], ['Unlisted Future Jewel', 'Jewels']]) {
      for (const Rarity of ['Normal', 'Magic', 'Rare']) {
        for (const Identified of [false, true]) {
          for (const AreaLevel of [1, 82]) {
            const item = { BaseType, Class, Rarity, Identified, AreaLevel, UnidentifiedItemTier: 0 };
            for (const ItemLevel of [80, 81, 90]) {
              const result = firstTerminal(filter, { ...item, ItemLevel });
              assert.equal(result.action, 'Show', JSON.stringify({ ...item, ItemLevel }));
            }
            assert.equal(firstTerminal(filter, { ...item, ItemLevel: 79 }).action, 'Hide', JSON.stringify(item));
          }
        }
      }
    }
    for (const item of [
      { BaseType: 'Crude Bow', Class: 'Bows', Rarity: 'Magic', ItemLevel: 81 },
      { BaseType: 'Iron Cuirass', Class: 'Body Armours', Rarity: 'Rare', ItemLevel: 81 },
      { BaseType: 'Amethyst Ring', Class: 'Rings', Rarity: 'Magic', ItemLevel: 79 },
      { BaseType: 'Amber Amulet', Class: 'Amulets', Rarity: 'Rare', ItemLevel: 79 },
    ]) assert.equal(firstTerminal(filter, item).action, 'Hide', JSON.stringify(item));
    for (const [BaseType, Class] of [['Amethyst Ring', 'Rings'], ['Amber Amulet', 'Amulets'], ['Rawhide Belt', 'Belts']]) {
      for (const Identified of [false, true]) {
        const item = { BaseType, Class, Rarity: 'Unique', Identified };
        assert.equal(firstTerminal(filter, { ...item, ItemLevel: 80 }).action, 'Hide', JSON.stringify(item));
        const high = firstTerminal(filter, { ...item, ItemLevel: 81 });
        assert.equal(high.action, 'Show');
        if (customSounds) assert.match(high.block, /sounds\/0103\.wav/);
      }
    }
    const nativeSelection = render({ ...config.profiles[2], strictEndgame: false }, customSounds);
    for (const BaseType of ['Ruby', 'Emerald', 'Sapphire']) {
      for (const ItemLevel of [1, 79, 80]) {
        const item = { BaseType, Class: 'Jewels', Rarity: 'Unique', ItemLevel };
        assert.deepEqual(firstTerminal(filter, item), firstTerminal(nativeSelection, item), 'unique jewels retain their original item-level-independent rules');
      }
    }
  }
});

test('hell ordinary belts require item level eighty-two and an unidentified tier of at least four except chancing bases', () => {
  for (const customSounds of [false, true]) {
    const filter = render(config.profiles[2], customSounds);
    const nativeSelection = render({ ...config.profiles[2], strictEndgame: false }, customSounds);
    for (const BaseType of ['Rawhide Belt', 'Heavy Belt', 'Utility Belt', 'Unlisted Future Belt']) {
      for (const Rarity of ['Magic', 'Rare']) {
        for (const ItemLevel of [81, 82]) {
          for (const UnidentifiedItemTier of [3, 4, 5]) {
            for (const Identified of [false, true]) {
              for (const AreaLevel of [1, 82]) {
                const item = { BaseType, Class: 'Belts', Rarity, ItemLevel, UnidentifiedItemTier, Identified, AreaLevel };
                const result = firstTerminal(filter, item);
                const visible = ItemLevel >= 82 && UnidentifiedItemTier >= 4 && !Identified;
                assert.equal(result.action, visible ? 'Show' : 'Hide', JSON.stringify(item));
                if (visible && customSounds) assert.match(result.block, /sounds\/0397\.wav/);
                if (!visible) assert.deepEqual(result.notificationLines, []);
              }
            }
          }
        }
      }
      for (const ItemLevel of [81, 82, 90]) {
        assert.equal(firstTerminal(filter, { BaseType, Class: 'Belts', Rarity: 'Normal', ItemLevel,
          UnidentifiedItemTier: 0, Identified: false }).action, ['Heavy Belt', 'Utility Belt'].includes(BaseType) ? 'Show' : 'Hide', `${BaseType}: only valid chancing bases bypass the belt cutoff`);
      }
    }
    for (const BaseType of ['Rawhide Belt', 'Heavy Belt', 'Utility Belt']) {
      for (const Rarity of ['Magic', 'Rare']) {
        for (const UnidentifiedItemTier of [4, 5]) {
          const item = { BaseType, Class: 'Belts', Rarity, ItemLevel: 82, UnidentifiedItemTier, Identified: false };
          assert.deepEqual(firstTerminal(filter, item).notificationLines,
            firstTerminal(nativeSelection, item).notificationLines, 'retained belts keep the original tier alert priority');
        }
      }
    }
    const special = firstTerminal(filter, { BaseType: 'Rawhide Belt', Class: 'Belts', Rarity: 'Rare',
      ItemLevel: 20, UnidentifiedItemTier: 0, Identified: true, TwiceCorrupted: true });
    assert.equal(special.action, 'Show', 'the earlier exceptional state still takes priority');
    if (customSounds) assert.match(special.block, /sounds\/0397\.wav/);
  }
});

test('hard and CT give ordinary item-level-75 gloves A presentation without changing adjacent levels or special drops', () => {
  const gloveSection = /^# BEGIN PERSONAL GLOVE LEVEL75.*?^# END PERSONAL GLOVE LEVEL75\r?\n/gms;
  for (const customSounds of [false, true]) {
    const normal = render(config.profiles[0], customSounds);
    assert.doesNotMatch(normal, /BEGIN PERSONAL GLOVE LEVEL75/);
    for (const profile of regularProfiles.slice(1)) {
      const filter = render(profile, customSounds);
      assert.equal([...filter.matchAll(gloveSection)].length, 1);
      const baseline = filter.replace(gloveSection, '');
      for (const Rarity of ['Normal', 'Magic', 'Rare']) {
        for (const UnidentifiedItemTier of [0, 1, 2]) {
          const item = { BaseType: 'Adherent Cuffs', Class: 'Gloves', Rarity, UnidentifiedItemTier };
          const result = firstTerminal(filter, { ...item, ItemLevel: 75 });
          assert.equal(result.action, 'Show', `${profile.file}: ${Rarity}, tier ${UnidentifiedItemTier}`);
          assert.match(result.block, /^\s*SetTextColor 255 165 0 255\r?$/m);
          assert.match(result.block, /^\s*SetBorderColor 255 165 0 255\r?$/m);
          assert.match(result.block, /^\s*SetBackgroundColor 255 255 255 255\r?$/m);
          assert.match(result.block, /^\s*PlayAlertSound 1 250\r?$/m);
          if (customSounds) assert.match(result.block, /CustomAlertSoundOptional "sounds\/0103\.wav" 250/);
          else assert.doesNotMatch(result.block, /CustomAlertSound/);
          for (const ItemLevel of [74, 76]) {
            assert.deepEqual(firstTerminal(filter, { ...item, ItemLevel }),
              firstTerminal(baseline, { ...item, ItemLevel }), `${profile.file}: level ${ItemLevel} stays unchanged`);
          }
        }
      }
      for (const Rarity of ['Magic', 'Rare']) {
        for (const UnidentifiedItemTier of [3, 4, 5]) {
          const item = { BaseType: 'Adherent Cuffs', Class: 'Gloves', Rarity, UnidentifiedItemTier, ItemLevel: 75 };
          const result = firstTerminal(filter, item);
          assert.deepEqual(result, firstTerminal(baseline, item), 'higher unidentified tiers keep their original rule');
          if (customSounds) assert.match(result.block, /sounds\/0397\.wav/);
        }
      }
      for (const item of [
        { BaseType: 'Linen Wraps', Class: 'Gloves', Rarity: 'Unique', ItemLevel: 75 },
        { BaseType: 'Iron Cuirass', Class: 'Body Armours', Rarity: 'Rare', ItemLevel: 75 },
        { BaseType: 'Crude Bow', Class: 'Bows', Rarity: 'Magic', ItemLevel: 75 },
      ]) assert.deepEqual(firstTerminal(filter, item), firstTerminal(baseline, item), JSON.stringify(item));
    }
  }
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

test('C unique rings at item level eighty are hidden while high-level, special and ambiguous bases remain', () => {
  const filter = render();
  for (const Corrupted of [false, true]) {
    const result = firstTerminal(filter, { BaseType: 'Amethyst Ring', Class: 'Rings', Rarity: 'Unique', Corrupted, ItemLevel: 80 });
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
          if (profile.strictEndgame && ['Exalted Orb', 'Orb of Alchemy'].includes(BaseType)) continue;
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

test('hell keeps Exalted and Alchemy orbs with native unpriced alerts while verified one-Divine value still wins', () => {
  const names = ['Exalted Orb', 'Orb of Alchemy'];
  for (const customSounds of [false, true]) {
    const filters = config.profiles.map(profile => render(profile, customSounds));
    const lower = render(config.profiles[2], customSounds, names.map(BaseType => ({ BaseType, DivinePerItem: 0.001 })));
    const higher = render(config.profiles[2], customSounds, names.map(BaseType => ({ BaseType, DivinePerItem: 1 })));
    for (const BaseType of names) {
      for (const AreaLevel of [1, 64, 82]) {
        for (const StackSize of [1, 20]) {
          const item = { BaseType, Class: 'Stackable Currency', Rarity: 'Normal', AreaLevel, StackSize };
          assert.equal(firstTerminal(filters[0], item).action, 'Show', 'normal retains its existing display');
          assert.equal(firstTerminal(filters[1], item).action, 'Hide', 'hard retains its material cutoff');
          const native = firstTerminal(source, item);
          assert.equal(native.action, 'Show');
          assert.deepEqual(firstTerminal(filters[2], item), native, 'unpriced hell uses the original C rule');
          assert.deepEqual(firstTerminal(lower, item), native, 'a price below promotion thresholds keeps the native rule');
          const valuable = firstTerminal(higher, item);
          assert.equal(valuable.action, 'Show');
          assert.match(valuable.header, /S\+ Verified unit value/);
          if (customSounds) assert.match(valuable.block, /sounds\/0161\.wav/);
          else assert.doesNotMatch(valuable.block, /CustomAlertSound/);
        }
      }
    }
  }
});

test('hard and hell preserve higher crafting orbs and major currency', () => {
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
      ]) assert.equal(firstTerminal(lower, item).action,
        profile.selectiveLoot && ['Pinnacle Keys', 'Quest Items'].includes(item.Class) ? 'Hide' : 'Show', JSON.stringify(item));
    }
  }
  for (const preset of ['greater', 'greater-exalted']) {
    assert.throws(() => materialHideRules('Show\n    BaseType == "Regal Shard"\n', preset), /missing|changed|source|group|anchor/i);
  }
  assert.throws(() => materialHideRules(source, 'everything'), /material|preset|tier/i);
});

test('CT applies its gem level cutoff while PT excludes ordinary skill, spirit and support gems', () => {
  for (const customSounds of [false, true]) {
    for (const profile of config.profiles) {
      const filter = render(profile, customSounds);
      for (const [BaseType, Class] of [['Uncut Skill Gem', 'Uncut Skill Gems'], ['Uncut Spirit Gem', 'Uncut Spirit Gems']]) {
        for (const AreaLevel of [1, 64, 82]) {
          for (const GemLevel of [1, 18, 19, 20, 21]) {
            for (const gemName of [BaseType, `${BaseType} (Level ${GemLevel})`]) {
              const result = firstTerminal(filter, { BaseType: gemName, Class, Rarity: 'Normal', GemLevel, AreaLevel, ItemLevel: 1 });
              assert.equal(result.action, profile.selectiveLoot || (profile.strictEndgame && GemLevel < 19) ? 'Hide' : 'Show', `${profile.file}: ${gemName}, gem level ${GemLevel}, area ${AreaLevel}`);
              if (result.action === 'Hide') assert.deepEqual(result.notificationLines, []);
            }
          }
        }
        assert.equal(firstTerminal(filter, { BaseType, Class, Rarity: 'Normal', GemLevel: 18, ItemLevel: 90 }).action,
          profile.strictEndgame ? 'Hide' : 'Show', 'gem level is independent of item level');
      }
      for (const BaseType of ['Uncut Support Gem', 'Uncut Support Gem (Level 1)']) {
        assert.equal(firstTerminal(filter, { BaseType, Class: 'Uncut Support Gems', Rarity: 'Normal', GemLevel: 1 }).action, profile.selectiveLoot ? 'Hide' : 'Show');
      }
    }
  }
});

test('hard and hell hide every gold pile while normal retains its original display in both audio modes', () => {
  for (const customSounds of [false, true]) {
    for (const profile of config.profiles) {
      const filter = render(profile, customSounds);
      const goldGuard = filter.match(/^# BEGIN PERSONAL GOLD HIDE.*?^# END PERSONAL GOLD HIDE/gms)?.[0];
      if (profile.sourceMode === 'Endgame') {
        assert.ok(goldGuard);
        assert.match(goldGuard, /^\s*BaseType == "Gold"$/m);
        assert.doesNotMatch(goldGuard, /^\s*Class\b/m, 'Gold is a base type, not a supported item class');
      } else assert.equal(goldGuard, undefined);
      for (const AreaLevel of [1, 64, 82]) {
        for (const StackSize of [1, 99, 650, 2000, 5000, 1000000]) {
          const result = firstTerminal(filter, { BaseType: 'Gold', Class: 'Unspecified', Rarity: 'Normal', AreaLevel, StackSize });
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

test('strict selection preserves normal and hard and rejects changed policy anchors', () => {
  for (const profile of config.profiles.slice(0, 2)) {
    assert.equal(render(profile), render({ ...profile, strictEndgame: false }));
  }
  assert.notEqual(render(), render({ ...config.profiles[2], strictEndgame: false }));
  assert.throws(() => applyEndgameVisibility('Show\n    Rarity Rare\n'), /missing|changed|upstream|anchor/i);
  assert.throws(() => applySelectiveLoot(source.replace('$type->chancing $tier->chancea ', '$type->chancing $tier->changed ')),
    /selective.*missing/i);
  for (const profile of config.profiles.slice(0, 2)) {
    assert.equal(render(profile), render({ ...profile, selectiveLoot: false }));
    assert.throws(() => render({ ...profile, selectiveLoot: true }), /selective/i);
  }
  for (const selectiveLoot of ['true', null, 1]) {
    assert.throws(() => render({ ...config.profiles[2], selectiveLoot }), /selective/i);
  }
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

test('both hell profiles protect valid chancing bases before ordinary equipment cutoffs', () => {
  for (const profile of config.profiles.filter(profile => profile.strictEndgame)) {
    for (const customSounds of [false, true]) {
      const filter = render(profile, customSounds);
      for (const [BaseType, Class] of [['Heavy Belt', 'Belts'], ['Utility Belt', 'Belts'], ['Silver Charm', 'Charms']]) {
        for (const ItemLevel of [1, 75, 81, 82]) {
          const item = { BaseType, Class, Rarity: 'Normal', ItemLevel, UnidentifiedItemTier: 0,
            Mirrored: false, Corrupted: false };
          const valid = firstTerminal(filter, item);
          assert.equal(valid.action, 'Show', `${profile.file}: valid ${BaseType}, level ${ItemLevel}`);
          assert.match(valid.header, /\$type->chancing\b/);
          assert.deepEqual(valid.notificationLines, firstTerminal(source, item).notificationLines);
          for (const state of ['Mirrored', 'Corrupted']) {
            const invalid = firstTerminal(filter, { ...item, [state]: true });
            assert.doesNotMatch(invalid.header, /\$type->chancing\b/, `${profile.file}: ${state} ${BaseType} cannot be chanced`);
            if (profile.selectiveLoot || Class === 'Belts') {
              assert.equal(invalid.action, 'Hide');
              assert.deepEqual(invalid.notificationLines, []);
            }
          }
        }
      }
    }
  }
});

test('PT shows special bases and high unique categories while hiding ordinary gear and lower unique catchalls', () => {
  const profile = config.profiles.find(profile => profile.selectiveLoot);
  assert.ok(profile, 'PT profile exists');
  const shown = [
    { BaseType: 'Aberrant Sledge', Class: 'Two Hand Maces', Rarity: 'Magic', ItemLevel: 1 },
    { BaseType: 'Breach Ring', Class: 'Rings', Rarity: 'Magic', ItemLevel: 1 },
    { BaseType: 'Crude Bow', Class: 'Bows', Rarity: 'Magic', Quality: 27, ItemLevel: 1 },
    { BaseType: 'Crude Bow', Class: 'Bows', Rarity: 'Rare', TwiceCorrupted: true, ItemLevel: 1 },
    { BaseType: 'Ashen Wand', Class: 'Wands', Rarity: 'Magic', Identified: true, HasExplicitMod: ['Runic'] },
    { BaseType: 'Armoured Cap', Class: 'Helmets', Rarity: 'Unique', ItemLevel: 1 },
    { BaseType: 'Ruby', Class: 'Jewels', Rarity: 'Unique', ItemLevel: 1 },
    { BaseType: 'Timeless Jewel', Class: 'Jewels', Rarity: 'Unique', ItemLevel: 1 },
    { BaseType: 'Ring', Class: 'Rings', Rarity: 'Unique', Sockets: 1, ItemLevel: 1 },
    { BaseType: 'Heavy Belt', Class: 'Belts', Rarity: 'Unique', ItemLevel: 1 },
  ];
  const hidden = [
    { BaseType: 'Conjurer Mantle', Class: 'Body Armours', Rarity: 'Rare', UnidentifiedItemTier: 2 },
    { BaseType: 'Conjurer Mantle', Class: 'Body Armours', Rarity: 'Rare', UnidentifiedItemTier: 5 },
    { BaseType: 'Rawhide Belt', Class: 'Belts', Rarity: 'Rare', UnidentifiedItemTier: 4 },
    { BaseType: 'Adherent Cuffs', Class: 'Gloves', Rarity: 'Rare', ItemLevel: 75 },
    { BaseType: 'Amethyst Ring', Class: 'Rings', Rarity: 'Rare', ItemLevel: 80 },
    { BaseType: 'Gold Amulet', Class: 'Amulets', Rarity: 'Rare', ItemLevel: 90 },
    { BaseType: 'Emerald', Class: 'Jewels', Rarity: 'Magic', ItemLevel: 90 },
    { BaseType: 'Gold Ring', Class: 'Rings', Rarity: 'Unique', ItemLevel: 90 },
    { BaseType: 'Gold Amulet', Class: 'Amulets', Rarity: 'Unique', ItemLevel: 90 },
    { BaseType: 'Iron Cuirass', Class: 'Body Armours', Rarity: 'Unique' },
    { BaseType: 'Rawhide Belt', Class: 'Belts', Rarity: 'Unique', TwiceCorrupted: true },
    { BaseType: 'Unlisted Future Unique', Class: 'Wands', Rarity: 'Unique' },
    { BaseType: 'Unlisted Future Equipment', Class: 'Wands', Rarity: 'Magic', ItemLevel: 100, UnidentifiedItemTier: 5 },
    { BaseType: 'Uncut Skill Gem (Level 20)', Class: 'Uncut Skill Gems', Rarity: 'Normal', GemLevel: 20 },
    { BaseType: 'Uncut Spirit Gem (Level 20)', Class: 'Uncut Spirit Gems', Rarity: 'Normal', GemLevel: 20 },
    { BaseType: 'Uncut Support Gem (Level 3)', Class: 'Uncut Support Gems', Rarity: 'Normal', GemLevel: 3 },
    { BaseType: 'Tapestry Relic', Class: 'Relics', Rarity: 'Magic' },
    { BaseType: 'Ultimate Life Flask', Class: 'Life Flasks', Rarity: 'Magic' },
    { BaseType: 'Breachstone', Class: 'Breachstones', Rarity: 'Normal' },
    { BaseType: 'Faded Crisis Fragment', Class: 'Pinnacle Keys', Rarity: 'Normal' },
    { BaseType: 'Unlisted Future Item', Class: 'Future Class', Rarity: 'Normal' },
  ];
  for (const customSounds of [false, true]) {
    const filter = render(profile, customSounds);
    const ct = render(config.profiles[2], customSounds);
    for (const item of shown) {
      const result = firstTerminal(filter, item);
      assert.equal(result.action, 'Show', JSON.stringify(item));
      assert.deepEqual(result.notificationLines, firstTerminal(ct, item).notificationLines,
        'retained special categories keep their existing audio priority');
    }
    for (const item of hidden) {
      const result = firstTerminal(filter, item);
      assert.equal(result.action, 'Hide', JSON.stringify(item));
      assert.deepEqual(result.notificationLines, [], 'hidden PT drops carry no sound, beam or icon');
    }
    assert.equal(firstTerminal(filter, { BaseType: 'Orb of a Future Mechanic', Class: 'Stackable Currency', Rarity: 'Normal' }).action,
      'Show', 'the currency-specific unknown fallback remains available');
  }
});

test('PT keeps ordinary tablets and every waystone tier with shared map sounds and superior priorities', () => {
  const profile = config.profiles.find(profile => profile.selectiveLoot);
  for (const customSounds of [false, true]) {
    const filter = render(profile, customSounds);
    for (const BaseType of ['Abyss Tablet', 'Breach Tablet', 'Delirium Tablet', 'Expedition Tablet',
      'Irradiated Tablet', 'Overseer Tablet', 'Ritual Tablet', 'Temple Tablet']) {
      for (const Rarity of ['Normal', 'Magic', 'Rare']) {
        const result = firstTerminal(filter, { BaseType, Class: 'Tablet', Rarity });
        assert.equal(result.action, 'Show', `${BaseType}: ${Rarity}`);
        if (customSounds) assert.match(result.block, /sounds\/0398\.wav/);
      }
    }
    for (const [BaseType, expected] of [['Abyss Tablet', 'Show'], ['Temple Tablet', 'Show'],
      ['Irradiated Tablet', 'Show'], ['Breach Tablet', 'Hide'], ['Overseer Tablet', 'Hide']]) {
      assert.equal(firstTerminal(filter, { BaseType, Class: 'Tablet', Rarity: 'Unique' }).action,
        expected, `${BaseType}: Unique tablets follow the same high unique cutoff`);
    }
    for (let WaystoneTier = 1; WaystoneTier <= 16; WaystoneTier++) {
      for (const AreaLevel of [1, 82]) {
        for (const Rarity of ['Normal', 'Magic', 'Rare']) {
          const result = firstTerminal(filter, { BaseType: 'Waystone', Class: 'Waystones', Rarity, WaystoneTier, AreaLevel });
          assert.equal(result.action, 'Show', `waystone ${WaystoneTier}, area ${AreaLevel}, ${Rarity}`);
          if (customSounds) assert.match(result.block,
            WaystoneTier === 16 ? /sounds\/0397\.wav/ : /sounds\/0398\.wav/);
        }
      }
    }
    const exceptional = firstTerminal(filter, { BaseType: 'Waystone', Class: 'Waystones', Rarity: 'Rare', WaystoneTier: 15, AnyEnchantment: true });
    assert.equal(exceptional.action, 'Show');
    if (customSounds) assert.match(exceptional.block, /sounds\/0397\.wav/);
    const price = LEAGUE_ITEMS.find(item => item.base_type === 'Temple Tablet');
    const high = firstTerminal(render(profile, customSounds, [{ BaseType: price.base_type, MetadataId: price.metadata_id,
      ItemClass: price.item_class, DivinePerItem: 1 }]), { BaseType: price.base_type, Class: price.item_class, Rarity: 'Rare' });
    assert.equal(high.action, 'Show');
    assert.match(high.header, /S\+ Verified unit value/);
    if (customSounds) assert.match(high.block, /sounds\/0161\.wav/);
  }
});

test('one-Divine exchange tablet prices promote Normal, Magic and Rare tablets without repricing same-base uniques', () => {
  const names = ['Breach Tablet', 'Ritual Tablet', 'Temple Tablet'];
  const prices = names.map(name => {
    const item = LEAGUE_ITEMS.find(item => item.base_type === name);
    assert.ok(item, name);
    return { BaseType: item.base_type, ItemClass: item.item_class, MetadataId: item.metadata_id, DivinePerItem: 1 };
  });
  for (const profile of config.profiles) {
    for (const customSounds of [false, true]) {
      const baseline = render(profile, customSounds);
      const priced = render(profile, customSounds, prices);
      for (const BaseType of names) {
        for (const Rarity of ['Normal', 'Magic', 'Rare']) {
          const result = firstTerminal(priced, { BaseType, Class: 'Tablet', Rarity });
          assert.equal(result.action, 'Show');
          assert.match(result.header, /S\+ Verified unit value/);
          if (customSounds) assert.match(result.block, /sounds\/0161\.wav/);
        }
        const unique = { BaseType, Class: 'Tablet', Rarity: 'Unique' };
        const result = firstTerminal(priced, unique);
        assert.deepEqual(result, firstTerminal(baseline, unique), `${profile.file}: ${BaseType} Unique keeps its own grade`);
        assert.doesNotMatch(result.header, /S\+ Verified unit value/);
        assert.doesNotMatch(result.block, /sounds\/0161\.wav/);
        assert.equal(result.action, profile.selectiveLoot && BaseType === 'Breach Tablet' ? 'Hide' : 'Show');
        if (customSounds && result.action === 'Show') assert.match(result.block, /sounds\/0398\.wav/);
      }
    }
  }
});

test('PT one-Divine exchange items override its narrower baseline without repricing same-name quest items', () => {
  const profile = config.profiles.find(profile => profile.selectiveLoot);
  const items = [FADED_CRISIS_FRAGMENT,
    ABYSS_ITEMS.find(item => item.base_type === "Kulemak's Invitation"),
    LEAGUE_ITEMS.find(item => item.base_type === 'Breachstone')];
  for (const item of items) {
    for (const customSounds of [false, true]) {
      const fixture = { BaseType: item.base_type, Class: item.item_class, Rarity: 'Normal', AreaLevel: 1 };
      const price = { BaseType: item.base_type, MetadataId: item.metadata_id, ItemClass: item.item_class };
      for (const DivinePerItem of [0, 0.999]) {
        assert.equal(firstTerminal(render(profile, customSounds, [{ ...price, DivinePerItem }]), fixture).action,
          'Hide', `${item.base_type}: no one-Divine proof`);
      }
      const high = render(profile, customSounds, [{ ...price, DivinePerItem: 1 }]);
      const result = firstTerminal(high, fixture);
      assert.equal(result.action, 'Show');
      assert.match(result.header, /S\+ Verified unit value/);
      if (customSounds) assert.match(result.block, /sounds\/0161\.wav/);
      assert.doesNotMatch(firstTerminal(high, { ...fixture, Class: 'Quest Items' }).header,
        /S\+ Verified unit value/, 'same-name quest item cannot enter an exchange rule');
    }
  }
});

test('PT protects every registered exchange identity at one Chaos, including each uncut gem level', () => {
  const currency = JSON.parse(readFileSync(new URL('currency-map.json', root), 'utf8'));
  const mapping = [...currency, ...ABYSS_ITEMS, ...LEAGUE_ITEMS];
  const profile = config.profiles.find(profile => profile.selectiveLoot);
  const fixed = new Set(['Divine Orb', 'Mirror of Kalandra', "Hinekora's Lock"]);
  for (const customSounds of [false, true]) {
    const filter = render(profile, customSounds, mapping.map(item => exchangePrice(item, 0.01, 1)));
    for (const item of mapping) {
      const result = firstTerminal(filter, { ...exchangeDrop(item), AreaLevel: 1 });
      assert.equal(result.action, 'Show', item.base_type);
      if (fixed.has(item.base_type)) continue;
      assert.match(result.header, item.base_type === 'Chaos Orb' ? /Chaos category/ : /PT Verified unit value >= 1 Chaos/, item.base_type);
      if (item.base_type === 'Chaos Orb' && customSounds) assert.match(result.block, /sounds\/0090\.wav/);
      if (item.gem_level !== undefined) {
        assert.match(result.block, new RegExp(`GemLevel == ${item.gem_level}(?:\\r?\\n|$)`));
        assert.doesNotMatch(result.block, /^\s*BaseType ==/m);
      }
      if (ABYSS_ITEMS.some(abyss => abyss.metadata_id === item.metadata_id)) assertAbyssColours(result.block);
      assert.doesNotMatch(result.block, /sounds\/0161\.wav/, 'one Chaos does not imply one Divine');
      if (!customSounds) assert.doesNotMatch(result.block, /CustomAlertSound/);
      const quest = firstTerminal(filter, { ...exchangeDrop(item), Class: 'Quest Items' });
      assert.doesNotMatch(quest.header, /PT Verified unit value >= 1 Chaos/);
    }
  }
});

test('PT Chaos boundaries cover all requested content types before material, gem and final hides', () => {
  const currency = JSON.parse(readFileSync(new URL('currency-map.json', root), 'utf8'));
  const mapping = [...currency, ...ABYSS_ITEMS, ...LEAGUE_ITEMS];
  const names = ['Breachstone', 'Gnawed Rib', 'Simulacrum', 'Lesser Essence of Abrasion', 'Regal Orb',
    'Vaal Siphoner', 'Faded Crisis Fragment', 'Sacred Bloom', 'Soul Core of Zalatl', 'Ox Idol',
    'Uncut Skill Gem (Level 18)', 'Expedition Logbook', "Mórrigan's Insight"];
  const items = names.map(name => {
    const item = mapping.find(item => item.base_type === name);
    assert.ok(item, name);
    return item;
  });
  for (const customSounds of [false, true]) {
    for (const profile of config.profiles) {
      const unpriced = items.map(item => exchangePrice(item, 0.01));
      const baseline = render(profile, customSounds, unpriced);
      const below = render(profile, customSounds, items.map(item => exchangePrice(item, 0.01, 0.999)));
      const equal = render(profile, customSounds, items.map(item => exchangePrice(item, 0.01, 1)));
      const above = render(profile, customSounds, items.map(item => exchangePrice(item, 0.01, 1.001)));
      assert.equal(below, baseline, `${profile.file}: below one Chaos makes no new protection`);
      if (!profile.selectiveLoot) {
        assert.equal(equal, baseline);
        assert.equal(above, baseline);
        continue;
      }
      assert.equal(equal, above, 'the exact threshold and just above it use the same protection');
      for (const item of items) {
        const drop = { ...exchangeDrop(item), AreaLevel: 1, StackSize: 1 };
        const result = firstTerminal(equal, drop);
        if (['Breachstone', 'Gnawed Rib', 'Regal Orb', 'Uncut Skill Gem (Level 18)'].includes(item.base_type)) {
          assert.equal(firstTerminal(baseline, drop).action, 'Hide', item.base_type);
        }
        assert.equal(result.action, 'Show', item.base_type);
        assert.match(result.header, /PT Verified unit value >= 1 Chaos/);
        assert.doesNotMatch(result.block, /sounds\/0161\.wav/);
      }
    }
  }
});

test('PT Chaos protection keeps native currency presentation, tablet audio and the superior Divine tier', () => {
  const profile = config.profiles.find(profile => profile.selectiveLoot);
  const currency = JSON.parse(readFileSync(new URL('currency-map.json', root), 'utf8'));
  const regal = currency.find(item => item.base_type === 'Regal Orb');
  const tablets = ['Breach Tablet', 'Ritual Tablet', 'Temple Tablet'].map(name => LEAGUE_ITEMS.find(item => item.base_type === name));
  const presentation = result => result.block.split(/\r?\n/).map(line => line.trim())
    .filter(line => /^(?:Set\w+|Play\w+|CustomAlertSound\w*|MinimapIcon)\b/.test(line));
  for (const customSounds of [false, true]) {
    const baseline = render(profile, customSounds);
    const priced = render(profile, customSounds, [regal, ...tablets].map(item => exchangePrice(item, 0.01, 1)));
    const nativeRegal = firstTerminal(render(config.profiles[0], customSounds), exchangeDrop(regal));
    assert.deepEqual(presentation(firstTerminal(priced, exchangeDrop(regal))), presentation(nativeRegal));
    for (const item of tablets) {
      const ordinary = firstTerminal(priced, exchangeDrop(item));
      assert.equal(ordinary.action, 'Show');
      if (customSounds) assert.match(ordinary.block, /sounds\/0398\.wav/);
      assert.deepEqual(firstTerminal(priced, { ...exchangeDrop(item), Rarity: 'Unique' }),
        firstTerminal(baseline, { ...exchangeDrop(item), Rarity: 'Unique' }));
    }
    const high = render(profile, customSounds, [regal, ...tablets].map(item => exchangePrice(item, 1, 1)));
    for (const item of [regal, ...tablets]) {
      const result = firstTerminal(high, exchangeDrop(item));
      assert.match(result.header, /S\+ Verified unit value/);
      if (customSounds) assert.match(result.block, /sounds\/0161\.wav/);
    }
  }
});

test('gem level pricing protects only the matching level for Chaos and Divine promotions', () => {
  const profile = config.profiles.find(profile => profile.selectiveLoot);
  for (const Class of ['Uncut Skill Gems', 'Uncut Spirit Gems']) {
    const gems = [18, 19, 20].map(level => LEAGUE_ITEMS.find(item => item.item_class === Class && item.gem_level === level));
    assert.ok(gems.every(Boolean));
    for (const customSounds of [false, true]) {
      const chaos = render(profile, customSounds, [exchangePrice(gems[0], 0.01, 1), exchangePrice(gems[2], 0.01, 0.999)]);
      for (const [i, gem] of gems.entries()) {
        const result = firstTerminal(chaos, exchangeDrop(gem));
        assert.equal(result.action, i === 0 ? 'Show' : 'Hide', `${Class} level ${gem.gem_level}`);
      }
      const divine = render(profile, customSounds, [exchangePrice(gems[0], 1), exchangePrice(gems[2], 1)]);
      for (const [i, gem] of gems.entries()) {
        const result = firstTerminal(divine, exchangeDrop(gem));
        assert.equal(result.action, i === 1 ? 'Hide' : 'Show');
        if (i !== 1) {
          assert.match(result.header, /S\+ Verified unit value/);
          assert.match(result.block, new RegExp(`GemLevel == ${gem.gem_level}(?:\\r?\\n|$)`));
          if (customSounds) assert.match(result.block, /sounds\/0161\.wav/);
        }
      }
    }
  }
});

test('same-hour conversion at exactly one Chaos survives floating-point roundoff in PT', () => {
  const market = id => ({ league: 'Fixture League', market_pair: [id, DIVINE], volume_traded: { [id]: 93, [DIVINE]: 1 } });
  const hours = [10800, 7200, 3600].map(Hour => ({ Hour,
    Data: { markets: [market(CHAOS), market(FADED_CRISIS_FRAGMENT.metadata_id)] } }));
  const prices = getPrices(hours, 'Fixture League', [FADED_CRISIS_FRAGMENT]);
  assert.ok(Math.abs(prices[0].ChaosPerItem - 1) < 2e-15);
  const profile = config.profiles.find(profile => profile.selectiveLoot);
  for (const customSounds of [false, true]) {
    const result = firstTerminal(render(profile, customSounds, prices), exchangeDrop(FADED_CRISIS_FRAGMENT));
    assert.equal(result.action, 'Show');
    assert.match(result.header, /PT Verified unit value >= 1 Chaos/);
  }
});
