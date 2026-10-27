export const DIVINE = 'Metadata/Items/Currency/CurrencyModValues';
export const EXALTED = 'Metadata/Items/Currency/CurrencyAddModToRare';
const BASE_URL = 'https://web.poecdn.com/api/currency-exchange/poe2';

function volume(market, id) {
  const value = market.volume_traded?.[id];
  if (!Number.isSafeInteger(value) || value < 0 || value > 1e15) {
    throw new Error(`Invalid traded units: ${id}`);
  }
  return value;
}

function rateLimitReached(headers) {
  if (headers.has('retry-after')) return true;
  let blocked = false;
  for (const rule of (headers.get('x-rate-limit-rules') ?? '').split(',').map(s => s.trim()).filter(Boolean)) {
    const limits = headers.get(`x-rate-limit-${rule}`)?.split(',');
    const states = headers.get(`x-rate-limit-${rule}-state`)?.split(',');
    if (!limits || !states || limits.length !== states.length) throw new Error('Unrecognized rate-limit headers.');
    limits.forEach((entry, i) => {
      const limit = entry.split(':').map(Number);
      const state = states[i].split(':').map(Number);
      if (limit.length !== 3 || state.length !== 3 || [...limit, ...state].some(n => !Number.isFinite(n) || n < 0)) {
        throw new Error('Unrecognized rate-limit headers.');
      }
      if (state[0] >= limit[0] || state[2] > 0) blocked = true;
    });
  }
  return blocked;
}

export async function fetchHours({ now = Math.floor(Date.now() / 1000), fetchImpl = fetch } = {}) {
  if (!Number.isSafeInteger(now) || now < 10800) throw new Error('Invalid current timestamp.');
  const boundary = now - now % 3600;
  const hours = [];
  let blocked = false;
  for (const offset of [1, 2, 3]) {
    if (blocked) throw new Error('Rate limit reached. Retry next hour; existing output is preserved.');
    const hour = boundary - offset * 3600;
    const url = `${BASE_URL}/${hour}`;
    const response = await fetchImpl(url, {
      headers: { 'User-Agent': 'PoE2PersonalFilter/2.0 (personal-use; public currency-exchange CDN)' },
      signal: AbortSignal.timeout(30_000), redirect: 'error',
    });
    if (!response.ok) {
      throw new Error(`Official exchange HTTP ${response.status}; Retry-After=${response.headers.get('retry-after') ?? 'unspecified'}. No automatic retry.`);
    }
    blocked = rateLimitReached(response.headers);
    const data = await response.json();
    if (!data || !Number.isSafeInteger(data.next_change_id) || !Array.isArray(data.markets)) {
      throw new Error('Exchange schema changed.');
    }
    if (data.next_change_id === hour && data.markets.length === 0) continue;
    if (data.next_change_id !== hour + 3600) throw new Error('Exchange cursor/hour mismatch.');
    hours.push({ Hour: hour, Url: url, Data: data });
  }
  return hours;
}

export function getPrices(hours, league, mapping) {
  const observations = new Map();
  const seenHours = new Set();
  let leagueHours = 0;
  for (const { Hour, Data } of hours) {
    if (!Number.isSafeInteger(Hour) || Hour % 3600 !== 0 || seenHours.has(Hour) || !Array.isArray(Data?.markets)) {
      throw new Error('Invalid/duplicate exchange hour.');
    }
    seenHours.add(Hour);
    if (Data.markets.some(m => !m || typeof m.league !== 'string')) throw new Error('Invalid market league.');
    const markets = Data.markets.filter(m => m.league === league);
    if (!markets.length) continue;
    leagueHours++;
    const byPair = new Map();
    const key = (a, b) => [a, b].sort().join('|');
    for (const market of markets) {
      const pair = market.market_pair;
      if (!Array.isArray(pair) || pair.length !== 2 || pair.some(id => typeof id !== 'string' || !id.startsWith('Metadata/')) || pair[0] === pair[1]) {
        throw new Error('Invalid market pair.');
      }
      const pairKey = key(...pair);
      if (byPair.has(pairKey)) throw new Error('Duplicate market pair in one hour.');
      byPair.set(pairKey, market);
    }
    const anchor = byPair.get(key(DIVINE, EXALTED));
    let divinePerExalted = 0;
    if (anchor) {
      const exaltedUnits = volume(anchor, EXALTED);
      const divineUnits = volume(anchor, DIVINE);
      if (exaltedUnits > 0 && divineUnits >= 1) divinePerExalted = divineUnits / exaltedUnits;
    }
    for (const item of mapping) {
      const id = item.metadata_id;
      if (id === DIVINE) continue;
      let market = byPair.get(key(id, DIVINE));
      let units = market ? volume(market, id) : 0;
      let divineUnits = market ? volume(market, DIVINE) : 0;
      let route = 'direct-divine';
      if (!(units > 0 && divineUnits > 0)) {
        if (id === EXALTED || divinePerExalted <= 0) continue;
        market = byPair.get(key(id, EXALTED));
        if (!market) continue;
        units = volume(market, id);
        divineUnits = volume(market, EXALTED) * divinePerExalted;
        route = 'via-exalted';
      }
      if (!(units > 0 && divineUnits > 0)) continue;
      if (!Number.isFinite(divineUnits / units)) throw new Error('Non-finite currency price.');
      if (!observations.has(id)) observations.set(id, []);
      observations.get(id).push({ Hour, Units: units, DivineUnits: divineUnits, Rate: divineUnits / units, Route: route });
    }
  }
  if (leagueHours < 2) throw new Error(`League '${league}' has fewer than two completed hours. Existing output is preserved.`);
  const prices = [];
  for (const item of mapping) {
    const samples = observations.get(item.metadata_id) ?? [];
    if (samples.length < 2) continue;
    const units = samples.reduce((sum, s) => sum + s.Units, 0);
    const divineUnits = samples.reduce((sum, s) => sum + s.DivineUnits, 0);
    const rates = samples.map(s => s.Rate);
    if (units < 10 || divineUnits < 1 || Math.max(...rates) / Math.min(...rates) > 3) continue;
    prices.push({
      BaseType: item.base_type, MetadataId: item.metadata_id, DivinePerItem: divineUnits / units,
      ItemUnits: units, DivineVolume: divineUnits, Hours: samples.map(s => s.Hour),
      Routes: [...new Set(samples.map(s => s.Route))].sort(),
    });
  }
  if (!prices.length) throw new Error('No sufficiently reliable currency prices. Existing output is preserved.');
  return prices;
}
