import test from 'node:test';
import assert from 'node:assert/strict';
import { DIVINE, EXALTED, CHAOS, fetchHours, getPrices } from '../src/economy.mjs';

const VAAL = 'Metadata/Items/Currency/CurrencyCorrupt';
const mapping = [{ base_type: 'Chaos Orb', metadata_id: CHAOS }, { base_type: 'Vaal Orb', metadata_id: VAAL }];
const market = (a, b, x, y, league = 'Test') => ({ league, market_pair: [a, b], volume_traded: { [a]: x, [b]: y } });
const markets = () => [market(EXALTED, DIVINE, 1000, 10), market(CHAOS, EXALTED, 100, 200), market(VAAL, DIVINE, 100, 20), market(CHAOS, DIVINE, 1, 999, 'Other')];
const hour = (Hour, rows = markets()) => ({ Hour, Data: { markets: rows } });
const fixture = () => [hour(7200), hour(3600)];
const response = (data, headers = {}, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });

test('price directions, same-league isolation and item-unit weighting', () => {
  const prices = getPrices(fixture(), 'Test', mapping);
  assert.equal(prices.find(p => p.BaseType === 'Chaos Orb').DivinePerItem, 0.02);
  assert.equal(prices.find(p => p.BaseType === 'Vaal Orb').DivinePerItem, 0.2);
  assert.equal(prices.find(p => p.BaseType === 'Chaos Orb').ItemUnits, 200);
});

test('zero direct volume safely uses same-hour Exalted route', () => {
  const rows = [...markets(), market(CHAOS, DIVINE, 0, 0)];
  const price = getPrices([hour(7200, rows), hour(3600, rows)], 'Test', mapping).find(p => p.BaseType === 'Chaos Orb');
  assert.equal(price.DivinePerItem, 0.02);
  assert.deepEqual(price.Routes, ['via-exalted']);
});

const quoteRows = () => [
  market(EXALTED, DIVINE, 1000, 10), market(CHAOS, DIVINE, 2000, 10),
  market(VAAL, DIVINE, 10, 10), market(VAAL, CHAOS, 10, 2800), market(VAAL, EXALTED, 10, 1200),
];
const vaalPrice = hours => getPrices(hours, 'Test', mapping).find(p => p.BaseType === 'Vaal Orb');

test('selects the highest independently accepted Divine unit value across all quotes', () => {
  const price = vaalPrice([hour(7200, quoteRows()), hour(3600, quoteRows())]);
  assert.equal(price.DivinePerItem, 1.4);
  assert.equal(price.ItemClass, 'Stackable Currency');
  assert.deepEqual(price.Routes, ['via-chaos']);
  assert.equal(price.ItemUnits, 20);
  assert.deepEqual(price.CandidatePrices, [
    { Route: 'via-chaos', DivinePerItem: 1.4 },
    { Route: 'via-exalted', DivinePerItem: 1.2 },
    { Route: 'direct-divine', DivinePerItem: 1 },
  ]);
  const reverse = rows => rows.map(m => ({ ...m, market_pair: [...m.market_pair].reverse() }));
  assert.deepEqual(vaalPrice([hour(7200, reverse(quoteRows())), hour(3600, reverse(quoteRows()))]), price);
});

test('a priced pinnacle fragment preserves its exact filter class', () => {
  const fragment = 'Metadata/Items/Pinnacle/BurningMonolithKey2';
  const mapping = [{ base_type: 'Faded Crisis Fragment', metadata_id: fragment, item_class: 'Pinnacle Keys' }];
  const rows = [market(CHAOS, DIVINE, 2000, 10), market(fragment, DIVINE, 10, 10), market(fragment, CHAOS, 10, 2800)];
  const [price] = getPrices([hour(7200, rows), hour(3600, rows)], 'Test', mapping);
  assert.equal(price.ItemClass, 'Pinnacle Keys');
  assert.equal(price.DivinePerItem, 1.4);
  assert.deepEqual(price.Routes, ['via-chaos']);
});

test('compares converted values rather than raw Chaos amounts and breaks ties in favour of direct Divine', () => {
  const rows = quoteRows().map(m => m.market_pair.includes(VAAL) && m.market_pair.includes(DIVINE)
    ? market(VAAL, DIVINE, 10, 20) : m);
  assert.equal(vaalPrice([hour(7200, rows), hour(3600, rows)]).DivinePerItem, 2);
  assert.deepEqual(vaalPrice([hour(7200, rows), hour(3600, rows)]).Routes, ['direct-divine']);
  const tied = quoteRows().filter(m => !m.market_pair.includes(EXALTED)).map(m => m.market_pair.includes(VAAL) && m.market_pair.includes(CHAOS)
    ? market(VAAL, CHAOS, 10, 2000) : m);
  const earlierChaosOnly = tied.filter(m => !m.market_pair.includes(VAAL) || !m.market_pair.includes(DIVINE));
  const price = vaalPrice([hour(10800, earlierChaosOnly), hour(7200, tied), hour(3600, tied)]);
  assert.equal(price.DivinePerItem, 1);
  assert.deepEqual(price.Routes, ['direct-divine']);
});

test('Chaos conversion uses only a same-hour direct anchor or a same-hour Exalted fallback', () => {
  const rows = [market(EXALTED, DIVINE, 1000, 10), market(CHAOS, EXALTED, 100, 200),
    market(VAAL, DIVINE, 10, 10), market(VAAL, CHAOS, 10, 1000)];
  const price = vaalPrice([hour(7200, rows), hour(3600, rows)]);
  assert.equal(price.DivinePerItem, 2);
  assert.deepEqual(price.Routes, ['via-chaos']);
  const direct = [market(VAAL, DIVINE, 10, 10), market(VAAL, CHAOS, 10, 100000)];
  assert.deepEqual(vaalPrice([hour(7200, direct), hour(3600, direct)]).Routes, ['direct-divine']);
  const noAnchor = rows.filter(m => m.market_pair.includes(VAAL));
  assert.deepEqual(vaalPrice([hour(7200, rows), hour(3600, noAnchor)]).Routes, ['direct-divine']);
  const changingAnchor = [hour(7200, [market(CHAOS, DIVINE, 2000, 10), market(VAAL, CHAOS, 10, 1000)]),
    hour(3600, [market(CHAOS, DIVINE, 4000, 10), market(VAAL, CHAOS, 10, 2000)])];
  assert.equal(vaalPrice(changingAnchor).DivinePerItem, 0.5);
});

test('an unsupported high route cannot override another healthy route', () => {
  const anchor = market(CHAOS, DIVINE, 2000, 10);
  const direct = market(VAAL, DIVINE, 10, 8);
  const cases = [
    [[market(VAAL, CHAOS, 10, 4000)], []],
    [[market(VAAL, CHAOS, 1, 400)], [market(VAAL, CHAOS, 1, 400)]],
    [[market(VAAL, CHAOS, 10, 40)], [market(VAAL, CHAOS, 10, 40)]],
    [[market(VAAL, CHAOS, 10, 4000)], [market(VAAL, CHAOS, 10, 40000)]],
  ];
  for (const [newer, older] of cases) {
    const price = vaalPrice([hour(7200, [anchor, direct, ...newer]), hour(3600, [anchor, direct, ...older])]);
    assert.equal(price.DivinePerItem, 0.8);
    assert.deepEqual(price.Routes, ['direct-divine']);
    assert.deepEqual(price.CandidatePrices, [{ Route: 'direct-divine', DivinePerItem: 0.8 }]);
  }
});

test('hours from different routes are not pooled to manufacture an accepted price', () => {
  const anchors = [market(EXALTED, DIVINE, 1000, 10), market(CHAOS, DIVINE, 2000, 10)];
  const exalted = market(VAAL, EXALTED, 10, 600);
  const price = vaalPrice([
    hour(7200, [...anchors, exalted, market(VAAL, DIVINE, 10, 20)]),
    hour(3600, [...anchors, exalted, market(VAAL, CHAOS, 10, 2800)]),
  ]);
  assert.equal(price.DivinePerItem, 0.6);
  assert.deepEqual(price.Routes, ['via-exalted']);
  assert.equal(price.CandidatePrices.length, 1);
});

test('missing league, only one hour, duplicate hours and duplicate pairs fail closed', () => {
  assert.throws(() => getPrices(fixture(), 'Missing', mapping), /fewer than two/);
  assert.throws(() => getPrices([hour(7200)], 'Test', mapping), /fewer than two/);
  assert.throws(() => getPrices([hour(7200), hour(7200)], 'Test', mapping), /duplicate exchange hour/);
  assert.throws(() => getPrices([hour(7200, [...markets(), markets()[0]]), hour(3600)], 'Test', mapping), /Duplicate market pair/);
});

test('invalid traded units are rejected', () => {
  for (const invalid of [-1, 0.5, '2', true, null, NaN, Infinity, 1e16]) {
    const rows = [markets()[0], market(CHAOS, EXALTED, 100, invalid), markets()[2]];
    assert.throws(() => getPrices([hour(7200, rows), hour(3600)], 'Test', mapping), /Invalid traded units/);
  }
});

test('unstable rates, low item units and low Divine volume fall back independently', () => {
  const cases = [
    [hour(7200), hour(3600, [markets()[0], market(CHAOS, EXALTED, 100, 20000), markets()[2]])],
    [hour(7200, [market(CHAOS, DIVINE, 1, 1), markets()[2]]), hour(3600, [market(CHAOS, DIVINE, 1, 1), markets()[2]])],
    [hour(7200, [markets()[0], market(CHAOS, EXALTED, 100, 1), markets()[2]]), hour(3600, [markets()[0], market(CHAOS, EXALTED, 100, 1), markets()[2]])],
  ];
  for (const hours of cases) assert.equal(getPrices(hours, 'Test', mapping).some(p => p.BaseType === 'Chaos Orb'), false);
});

test('fetches exactly three completed hours from the PoE2 realm', async () => {
  const calls = [];
  const hours = await fetchHours({ now: 15000, fetchImpl: async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, 'error');
    assert.ok(options.headers['User-Agent']);
    return response({ next_change_id: Number(url.split('/').at(-1)) + 3600, markets: markets() });
  } });
  assert.deepEqual(hours.map(h => h.Hour), [10800, 7200, 3600]);
  assert.equal(calls.length, 3);
  assert.ok(calls.every(url => url.startsWith('https://web.poecdn.com/api/currency-exchange/poe2/')));
});

test('a not-yet-published latest digest does not prevent using prior two hours', async () => {
  const hours = await fetchHours({ now: 15000, fetchImpl: async url => {
    const timestamp = Number(url.split('/').at(-1));
    return response({ next_change_id: timestamp + (timestamp === 10800 ? 0 : 3600), markets: timestamp === 10800 ? [] : markets() });
  } });
  assert.equal(hours.length, 2);
  assert.equal(getPrices(hours, 'Test', mapping).length, 2);
});

test('HTTP429 and exhausted dynamic headers prevent further calls', async () => {
  for (const mode of ['429', 'limit', 'retry-after']) {
    let calls = 0;
    await assert.rejects(fetchHours({ now: 15000, fetchImpl: async url => {
      calls++;
      if (mode === '429') return response({}, { 'retry-after': '60' }, 429);
      const headers = mode === 'limit' ? { 'x-rate-limit-rules': 'client', 'x-rate-limit-client': '1:60:60', 'x-rate-limit-client-state': '1:60:0' } : { 'retry-after': '60' };
      return response({ next_change_id: Number(url.split('/').at(-1)) + 3600, markets: markets() }, headers);
    } }), /429|Rate limit/);
    assert.equal(calls, 1);
  }
});

test('changed schema, wrong cursor and malformed limit headers fail closed', async () => {
  const broken = [
    [{ next_change_id: 14400, markets: {} }, {}],
    [{ next_change_id: 18000, markets: [] }, {}],
    [{ next_change_id: 14400, markets: [] }, { 'x-rate-limit-rules': 'client' }],
  ];
  for (const [data, headers] of broken) await assert.rejects(fetchHours({ now: 15000, fetchImpl: async () => response(data, headers) }), /schema|cursor|rate-limit/);
});
