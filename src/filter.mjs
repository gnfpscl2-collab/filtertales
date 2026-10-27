const equipmentClasses = [
  'Amulets', 'Belts', 'Body Armours', 'Boots', 'Bows', 'Bucklers',
  'Crossbows', 'Foci', 'Gloves', 'Helmets', 'One Hand Maces',
  'Quarterstaves', 'Quivers', 'Rings', 'Sceptres', 'Shields',
  'Spears', 'Staves', 'Talismans', 'Two Hand Maces', 'Wands',
];

const showBlocks = /^Show[^\r\n]*\r?\n(?:[ \t]+\S[^\r\n]*(?:\r?\n|$))+/gm;
const quoteNames = names => [...new Set(names)].sort().map(name => `"${name}"`).join(' ');
export const DEFAULT_SOUNDS = Object.freeze({
  value: '0161.wav', chaos: '0090.wav', maps: '0398.wav', exceptional: '0397.wav',
  pinnacle: '777.wav', ab: '0103.wav', low: '0011.wav',
});

export function validateSounds(sounds) {
  const keys = Object.keys(DEFAULT_SOUNDS);
  if (!sounds || typeof sounds !== 'object' || Array.isArray(sounds)
    || Object.keys(sounds).length !== keys.length
    || keys.some(key => typeof sounds[key] !== 'string' || !/^[A-Za-z0-9_-]{1,80}\.wav$/i.test(sounds[key]))) {
    throw new Error('Invalid sound filenames or categories.');
  }
  return sounds;
}

function grade(block) {
  const header = block.split(/\r?\n/, 1)[0];
  if (/\$tier->restex\b|\$type->gold\b/.test(header)) return 0;
  if (/\$type->uniques\b/.test(header) || /\$type->sockets->general \$tier->[sa]\b/.test(header)) return 2;
  if (/\$type->exoticbases\b|\$type->endgame->normalcraft->economy\b/.test(header)) return 1;
  if (/\$tier->s\b|!apex_stier\b/.test(header)) return 3;
  if (/\$tier->a\b|!(?:currency|fragments|xeno)_a\b/.test(header)) return 2;
  if (/\$tier->b\b|!(?:currency|fragments|xeno)_b\b|!exotics_btier\b/.test(header)) return 1;
  return 0;
}

function setActions(block, actions) {
  const newline = block.includes('\r\n') ? '\r\n' : '\n';
  for (const [action, value] of Object.entries(actions)) {
    const pattern = new RegExp(`^[ \\t]*${action}[^\\r\\n]*`, 'gm');
    const line = `    ${action} ${value}`;
    if (pattern.test(block)) block = block.replace(pattern, line);
    else {
      const insertion = block.indexOf('\n') + 1;
      block = block.slice(0, insertion) + line + newline + block.slice(insertion);
    }
  }
  return block;
}

const sActions = {
  SetFontSize: '45', SetTextColor: '255 0 0 255', SetBorderColor: '255 0 0 255',
  SetBackgroundColor: '255 255 255 255', PlayEffect: 'Red', MinimapIcon: '0 Red Star',
};
const aActions = {
  SetTextColor: '255 255 255 255', SetBorderColor: '255 165 0 255',
  SetBackgroundColor: '255 165 0 255', MinimapIcon: '1 Orange Diamond',
};

function nativeCurrencyBActions(source) {
  const block = [...source.matchAll(showBlocks)].map(match => match[0])
    .find(value => /\$type->currency \$tier->b\b/.test(value.split(/\r?\n/, 1)[0]));
  if (!block) throw new Error('Upstream native currency B palette missing.');
  const actions = {};
  for (const action of ['SetFontSize', 'SetTextColor', 'SetBorderColor', 'SetBackgroundColor', 'PlayAlertSound', 'PlayEffect', 'MinimapIcon']) {
    const value = block.match(new RegExp(`^[ \\t]*${action}[ \\t]+([^\\r\\n]+)`, 'm'))?.[1];
    if (!value) throw new Error(`Upstream native currency B action missing: ${action}`);
    actions[action] = value;
  }
  return actions;
}

function customAlert(block, filename) {
  const actions = { CustomAlertSoundOptional: `"sounds/${filename}" 250` };
  if (!/^[ \t]*PlayAlertSound(?:Positional)?\b/m.test(block)) actions.PlayAlertSound = '2 250';
  return setActions(block, actions);
}

function exceptional(block) {
  const header = block.split(/\r?\n/, 1)[0];
  return /\$type->exotic->(?:exceptional|state)\b|\$type->exoticmods\b|!uniques_exceptional\b|\$tier->restex\b/.test(header)
    || (/\$type->ut->/.test(header) && /^[ \t]*UnidentifiedItemTier\s+>=\s*[3-9]\b/m.test(block))
    || (/\$type->waystones\b/.test(header) && /!maps_special[bc]\b/.test(header));
}

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
    if (grade(block) === 3) return setActions(block, sActions);
    if (grade(block) === 2) {
      const actions = { ...aActions };
      if (/^[ \t]*PlayEffect /m.test(block)) actions.PlayEffect = 'Orange Temp';
      return setActions(block, actions);
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

export function applyCategorySounds(source, sounds = DEFAULT_SOUNDS) {
  validateSounds(sounds);
  return source.replace(showBlocks, block => {
    const header = block.split(/\r?\n/, 1)[0];
    if (/^[ \t]*Continue\b/m.test(block)) return block;
    // Gold has no personal item grade; keep it quiet instead of sounding for every gold pile.
    if (/\$type->gold\b/.test(header)) return block;
    const newline = block.includes('\r\n') ? '\r\n' : '\n';
    if (exceptional(block)) return customAlert(block, sounds.exceptional);
    if (/\$type->waystones\b/.test(header)) return customAlert(block, sounds.maps);
    const fallback = customAlert(block, grade(block) >= 1 ? sounds.ab : sounds.low);
    const baseLine = block.match(/^[ \t]*BaseType[ \t]+==[ \t]+([^\r\n]+)/m);
    if (!baseLine) return fallback;
    const tablets = [...baseLine[1].matchAll(/"([^"]+)"/g)].filter(match => match[1].endsWith(' Tablet'));
    if (!tablets.length) return fallback;
    const classLine = block.match(/^[ \t]*Class[ \t]+(==[ \t]+)?((?:"[^"\r\n]+"[ \t]*)+)[ \t]*$/m);
    if (classLine && ![...classLine[2].matchAll(/"([^"]+)"/g)]
      .some(match => classLine[1] ? match[1] === 'Tablet' : 'Tablet'.includes(match[1]))) return fallback;
    let clone = block.slice(0, baseLine.index) + `    BaseType == ${quoteNames(tablets.map(match => match[1]))}`
      + block.slice(baseLine.index + baseLine[0].length);
    let conditions = '';
    if (!/^[ \t]*Class\b/m.test(clone)) conditions += '    Class == "Tablet"' + newline;
    if (/\$type->fragments->generic \$tier->[abc]\b/.test(header) && !/^[ \t]*Rarity\b/m.test(clone)) {
      conditions += '    Rarity Normal Magic Rare' + newline;
    }
    const firstLine = clone.indexOf('\n') + 1;
    clone = clone.slice(0, firstLine) + conditions + clone.slice(firstLine);
    return '# BEGIN PERSONAL TABLET SOUND' + newline + customAlert(clone, sounds.maps)
      + '# END PERSONAL TABLET SOUND' + newline + fallback;
  });
}

export function renderFilter({ source, prices, league, profile, release, dataLabel, customSounds = false, sounds = DEFAULT_SOUNDS }) {
  if (typeof customSounds !== 'boolean') throw new Error('customSounds must be a boolean.');
  validateSounds(sounds);
  const floors = baselineFloors(source);
  const nativeB = nativeCurrencyBActions(source);
  for (const value of [league, profile.file, release, dataLabel]) {
    if (typeof value !== 'string' || /[\r\n\x00-\x1f]/.test(value)) throw new Error('Invalid filter header value.');
  }
  for (const price of prices) {
    if (!/^[A-Za-z][A-Za-z0-9 ',-]{1,90}$/.test(price.BaseType)
      || !Number.isFinite(price.DivinePerItem) || price.DivinePerItem < 0
      || !source.includes(`"${price.BaseType}"`)) throw new Error('Invalid/unrecognized currency price.');
  }
  const fixed = ['Mirror of Kalandra', "Hinekora's Lock", 'Divine Orb'];
  const rareNames = prices.filter(price => price.DivinePerItem >= 1 && !fixed.includes(price.BaseType)).map(price => price.BaseType);
  const groups = new Map([[1, []], [2, []]]);
  for (const price of prices) {
    if ([...fixed, 'Chaos Orb'].includes(price.BaseType) || price.DivinePerItem >= 1) continue;
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
  ];
  const addRule = (label, names, actions, filename, areaLevel = false) => {
    lines.push(`Show # ${label}`);
    if (areaLevel) lines.push('    AreaLevel >= 65');
    lines.push('    Class == "Stackable Currency"', `    BaseType == ${quoteNames(names)}`);
    for (const [action, value] of Object.entries(actions)) lines.push(`    ${action} ${value}`);
    if (customSounds) lines.push(`    CustomAlertSoundOptional "sounds/${filename}" 250`);
    lines.push('');
  };
  addRule('S+ Mirror of Kalandra and Hinekora\'s Lock', fixed.slice(0, 2), { ...sActions, PlayAlertSound: '6 250' }, sounds.pinnacle);
  addRule('Fixed Divine Orb = one Divine, all areas', ['Divine Orb'], { ...sActions, PlayAlertSound: '1 250' }, sounds.value);
  lines.push('# BEGIN PERSONAL ECONOMY');
  if (rareNames.length) {
    addRule('Verified unit value >= 1 Divine, regardless of upstream tier, all areas', rareNames,
      { ...sActions, PlayAlertSound: '1 250' }, sounds.value);
  }
  for (const rank of [2, 1]) {
    if (!groups.get(rank).length) continue;
    const actions = rank === 2
      ? { SetFontSize: '43', ...aActions, PlayAlertSound: '1 250', PlayEffect: 'Orange Temp' }
      : nativeB;
    // shortcut: lower-value visual promotions retain upstream campaign exceptions until requested otherwise.
    addRule(`Personal economy promotion tier ${rank}`, groups.get(rank), actions, sounds.ab, true);
  }
  lines.push('# END PERSONAL ECONOMY');
  addRule('Chaos category, after verified >=1 Divine priority', ['Chaos Orb'], nativeB, sounds.chaos);
  lines.push(
    '# BEGIN NEVERSINK (personal visual policy and optional sounds; conditions preserved)',
  );
  const styled = applyVisualPolicy(source);
  const ranged = addItemLevelRange(styled, profile.minItemLevel, profile.maxItemLevel);
  return lines.join('\n') + '\n' + (customSounds ? applyCategorySounds(ranged, sounds) : ranged);
}
