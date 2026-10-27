const equipmentClasses = [
  'Amulets', 'Belts', 'Body Armours', 'Boots', 'Bows', 'Bucklers',
  'Crossbows', 'Foci', 'Gloves', 'Helmets', 'One Hand Maces',
  'Quarterstaves', 'Quivers', 'Rings', 'Sceptres', 'Shields',
  'Spears', 'Staves', 'Talismans', 'Two Hand Maces', 'Wands',
];

const showBlocks = /^Show[^\r\n]*\r?\n(?:[ \t]+\S[^\r\n]*(?:\r?\n|$))+/gm;
const quoteNames = names => [...new Set(names)].sort().map(name => `"${name}"`).join(' ');

export function baselineFloors(source) {
  const sections = [...source.matchAll(/^# \[\[2600\]\].*?(?=^# \[\[2700\]\])/gms)];
  if (!sections.length) throw new Error('Upstream currency section changed. Review the new source.');
  const floors = new Map();
  for (const block of sections.at(-1)[0].split(/(?=^(?:Show |Hide ))/m)) {
    const header = block.match(/^Show #[^\r\n]*\$type->currency \$tier->([sab])\b/);
    if (!header) continue;
    const names = block.match(/^[ \t]*BaseType == ([^\r\n]+)/m);
    if (!names) throw new Error('Upstream currency tier has no exact BaseType list.');
    for (const name of names[1].matchAll(/"([^"]+)"/g)) floors.set(name[1], { s: 3, a: 2, b: 1 }[header[1]]);
  }
  for (const name of ['Divine Orb', 'Mirror of Kalandra', "Hinekora's Lock"]) {
    if (floors.get(name) !== 3) throw new Error(`Upstream top-tier guard failed: ${name}`);
  }
  return floors;
}

export function applyVisualPolicy(source) {
  return source.replace(/^Show[^\r\n]*\r?\n(?:(?!^(?:Show|Hide)\b).)*/gms, block => {
    const header = block.split(/\r?\n/, 1)[0];
    const actions = {};
    if (/\$type->currency \$tier->s\b/.test(header)) {
      Object.assign(actions, {
        SetFontSize: '45', SetTextColor: '255 215 80', SetBorderColor: '255 185 40',
        SetBackgroundColor: '40 25 5 240', PlayEffect: 'Orange',
        MinimapIcon: '0 Orange Star', PlayAlertSound: '1 250',
      });
    } else if (/\$type->currency \$tier->a\b|\$type->sockets->general \$tier->[sa]\b/.test(header)
      || (/\$type->uniques\b/.test(header) && !/\$tier->restex\b/.test(header))) {
      Object.assign(actions, {
        SetTextColor: '205 160 255', SetBorderColor: '170 100 255',
        SetBackgroundColor: '30 15 45 235', MinimapIcon: '1 Purple Diamond',
      });
      if (/^[ \t]*PlayEffect /m.test(block)) actions.PlayEffect = 'Purple Temp';
    } else if (/\$type->currency \$tier->b\b|\$type->endgame->normalcraft->economy\b|\$type->exoticbases\b/.test(header)) {
      actions.SetBorderColor = '70 150 255';
      if (/\$type->currency \$tier->b\b/.test(header)) {
        actions.SetTextColor = '130 200 255';
        actions.SetBackgroundColor = '10 25 45 235';
      }
    }
    for (const [action, value] of Object.entries(actions)) {
      const pattern = new RegExp(`^[ \\t]*${action}[^\\r\\n]*`, 'gm');
      const line = `    ${action} ${value}`;
      if (pattern.test(block)) block = block.replace(pattern, line);
      else {
        const insertion = block.indexOf('\n') + 1;
        block = block.slice(0, insertion) + line + '\n' + block.slice(insertion);
      }
    }
    return block;
  });
}

export function addItemLevelRange(source, minimum, maximum) {
  if (!Number.isInteger(minimum) || !Number.isInteger(maximum)
    || minimum < 1 || maximum < 0 || (maximum > 0 && maximum < minimum)) {
    throw new Error('Invalid personal item-level range.');
  }
  for (const name of equipmentClasses) {
    if (!source.includes(`"${name}"`)) throw new Error(`Upstream equipment class missing: ${name}`);
  }
  const markers = [...source.matchAll(/^#={20,}\r?\n# \[\[0900\]\] Endgame Flasks[ \t]*\r?\n#={20,}\r?$/gm)];
  if (!markers.length) throw new Error('Actual upstream section 0900 marker missing.');
  // shortcut: earlier terminal safeguards include some T2 gear; review before enforcing a stricter range.
  const lines = ['# BEGIN PERSONAL ITEMLEVEL RANGE'];
  for (const [operator, bound] of [['<', minimum > 1 ? minimum : 0], ['>', maximum]]) {
    if (!bound) continue;
    lines.push(
      `Hide # Ordinary equipment ${operator === '<' ? 'below' : 'above'} the selected item-level range`,
      '    Rarity Normal Magic Rare', `    Class == ${quoteNames(equipmentClasses)}`,
      `    ItemLevel ${operator} ${bound}`, '',
    );
  }
  lines.push('# END PERSONAL ITEMLEVEL RANGE', '', '');
  const insertion = markers.at(-1).index;
  return source.slice(0, insertion) + lines.join('\n') + source.slice(insertion);
}

export function applyCategorySounds(source) {
  return source.replace(showBlocks, block => {
    const header = block.split(/\r?\n/, 1)[0];
    if (/^[ \t]*Continue\b/m.test(block)) return block;
    const newline = block.includes('\r\n') ? '\r\n' : '\n';
    const sound = block.match(/^[ \t]*PlayAlertSound(?:Positional)?\b[^\r\n]*/m);
    if (!sound) return block;
    if (/\$type->waystones \$tier->waystone_t(?:[1-9]|1[0-5])\b/.test(header)) {
      const insertion = sound.index + sound[0].length;
      return block.slice(0, insertion) + newline
        + '    CustomAlertSoundOptional "sounds/tw-quest-reward.wav" 250' + block.slice(insertion);
    }
    if (!/\$type->fragments->generic \$tier->[bc]\b/.test(header)) return block;
    const baseLine = block.match(/^[ \t]*BaseType[ \t]+==[ \t]+([^\r\n]+)/m);
    if (!baseLine) return block;
    const tablets = [...baseLine[1].matchAll(/"([^"]+)"/g)].filter(match => match[1].endsWith(' Tablet'));
    if (!tablets.length) return block;
    let clone = block.slice(0, baseLine.index) + `    BaseType == ${quoteNames(tablets.map(match => match[1]))}`
      + block.slice(baseLine.index + baseLine[0].length);
    let conditions = '';
    if (!/^[ \t]*Class\b/m.test(clone)) conditions += '    Class == "Tablet"' + newline;
    if (!/^[ \t]*Rarity\b/m.test(clone)) conditions += '    Rarity Normal Magic Rare' + newline;
    const firstLine = clone.indexOf('\n') + 1;
    clone = clone.slice(0, firstLine) + conditions + clone.slice(firstLine);
    const cloneSound = clone.match(/^[ \t]*PlayAlertSound(?:Positional)?\b[^\r\n]*/m);
    const insertion = cloneSound.index + cloneSound[0].length;
    clone = clone.slice(0, insertion) + newline
      + '    CustomAlertSoundOptional "sounds/tw-level-up.wav" 250' + clone.slice(insertion);
    return '# BEGIN PERSONAL TABLET SOUND' + newline + clone + '# END PERSONAL TABLET SOUND' + newline + block;
  });
}

export function renderFilter({ source, prices, league, profile, release, dataLabel, customSounds = false }) {
  if (typeof customSounds !== 'boolean') throw new Error('customSounds must be a boolean.');
  const floors = baselineFloors(source);
  for (const value of [league, profile.file, release, dataLabel]) {
    if (typeof value !== 'string' || /[\r\n\x00-\x1f]/.test(value)) throw new Error('Invalid filter header value.');
  }
  for (const price of prices) {
    if (!/^[A-Za-z][A-Za-z0-9 ',-]{1,90}$/.test(price.BaseType)
      || !Number.isFinite(price.DivinePerItem) || price.DivinePerItem < 0
      || !source.includes(`"${price.BaseType}"`)) throw new Error('Invalid/unrecognized currency price.');
  }
  const rareNames = prices.filter(price => price.DivinePerItem >= 1
    && !['Mirror of Kalandra', 'Divine Orb'].includes(price.BaseType)).map(price => price.BaseType);
  const groups = new Map([[1, []], [2, []]]);
  for (const price of prices) {
    if (['Mirror of Kalandra', 'Divine Orb', 'Chaos Orb'].includes(price.BaseType) || price.DivinePerItem >= 1) continue;
    const rank = price.DivinePerItem >= 0.1 ? 2 : price.DivinePerItem >= 0.01 ? 1 : 0;
    if (rank > (floors.get(price.BaseType) ?? 0)) groups.get(rank).push(price.BaseType);
  }
  const lines = [
    '# Personal PoE2 filter - derivative of NeverSink (MIT; see LICENSE-NeverSink.txt)',
    `# Upstream release: ${release} | mode: ${profile.file}`,
    `# Ordinary equipment ItemLevel: ${profile.minItemLevel}..${profile.maxItemLevel} (0 upper means unbounded); early upstream safeguards take priority.`,
    '# Equipment required level is not a supported condition. DropLevel is not used as a substitute.',
    `# Economy league: ${league} | ${dataLabel}`,
    '# Estimated historical unit values. No price-based Hide. Reload manually in game.',
    `# Custom sounds: ${customSounds ? 'enabled' : 'disabled; built-in PoE2 alerts only'}`,
    '# Fixed S+ personal priority (independent of price data)',
    'Show # S+ Mirror of Kalandra', '    Class == "Stackable Currency"',
    '    BaseType == "Mirror of Kalandra"', '    SetFontSize 45', '    SetTextColor 255 255 255',
    '    SetBorderColor 255 30 45', '    SetBackgroundColor 180 10 25 245', '    PlayEffect Red',
    '    MinimapIcon 0 Red Star', '    PlayAlertSound 6 250',
    '    CustomAlertSoundOptional "sounds/tw-rare-drop.wav" 250', '',
    'Show # Fixed Divine Orb = one Divine, all areas', '    Class == "Stackable Currency"',
    '    BaseType == "Divine Orb"', '    SetFontSize 45', '    SetTextColor 255 215 80',
    '    SetBorderColor 255 185 40', '    SetBackgroundColor 40 25 5 240', '    PlayEffect Orange',
    '    MinimapIcon 0 Orange Star', '    PlayAlertSound 1 250',
    '    CustomAlertSoundOptional "sounds/tw-rare-drop.wav" 250', '', '# BEGIN PERSONAL ECONOMY',
  ];
  if (rareNames.length) {
    lines.push(
      'Show # Verified unit value >= 1 Divine, regardless of upstream tier, all areas',
      '    Class == "Stackable Currency"', `    BaseType == ${quoteNames(rareNames)}`,
      '    SetFontSize 45', '    SetTextColor 255 215 80', '    SetBorderColor 255 185 40',
      '    SetBackgroundColor 40 25 5 240', '    PlayEffect Orange', '    MinimapIcon 0 Orange Star',
      '    PlayAlertSound 1 250', '    CustomAlertSoundOptional "sounds/tw-rare-drop.wav" 250', '',
    );
  }
  for (const rank of [2, 1]) {
    if (!groups.get(rank).length) continue;
    const [font, text, background, colour, shape, icon, sound] = rank === 2
      ? ['43', '205 160 255', '30 15 45 235', 'Purple', 'Diamond', '1', '1']
      : ['42', '130 200 255', '10 25 45 235', 'Blue', 'Circle', '1', '2'];
    // shortcut: lower-value visual promotions retain upstream campaign exceptions until requested otherwise.
    lines.push(
      `Show # Personal economy promotion tier ${rank}`, '    AreaLevel >= 65',
      '    Class == "Stackable Currency"', `    BaseType == ${quoteNames(groups.get(rank))}`,
      `    SetFontSize ${font}`, `    SetTextColor ${text}`, `    SetBackgroundColor ${background}`,
      `    SetBorderColor ${text}`, `    PlayAlertSound ${sound} 250`, `    PlayEffect ${colour}`,
      `    MinimapIcon ${icon} ${colour} ${shape}`, '',
    );
  }
  lines.push(
    '# END PERSONAL ECONOMY', 'Show # Chaos category, after verified >=1 Divine priority',
    '    Class == "Stackable Currency"', '    BaseType == "Chaos Orb"', '    SetFontSize 42',
    '    SetTextColor 130 200 255', '    SetBorderColor 70 150 255', '    SetBackgroundColor 10 25 45 235',
    '    PlayEffect Blue', '    MinimapIcon 1 Blue Circle', '    PlayAlertSound 2 250',
    '    CustomAlertSoundOptional "sounds/tw-level-up.wav" 250', '',
    '# BEGIN NEVERSINK (personal visual policy and optional sounds; conditions preserved)',
  );
  const styled = applyVisualPolicy(source);
  const ranged = addItemLevelRange(styled, profile.minItemLevel, profile.maxItemLevel);
  const rendered = lines.join('\n') + '\n' + (customSounds ? applyCategorySounds(ranged) : ranged);
  return customSounds ? rendered : rendered.replace(/^[ \t]*CustomAlertSoundOptional[^\r\n]*\r?\n/gm, '');
}
