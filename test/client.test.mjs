// The client against a local server that answers like the API.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  Client, Result, AuthError, BadRequestError, PlanError, RateLimitError, ServiceError, KlineLensError, _timing,
} from '../src/index.js';

const seen = [];      // { path, query, headers } of every request
const script = {};    // path -> [[status, body], ...] answered in turn; the last repeats
let server, base;

before(async () => {
  server = createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    seen.push({ path: u.pathname, query: Object.fromEntries(u.searchParams), headers: req.headers });
    const queue = script[u.pathname] ?? [[200, { data: { path: u.pathname }, meta: { version: 'v1' } }]];
    const [status, body] = queue.length > 1 ? queue.shift() : queue[0];
    res.writeHead(status, { 'content-type': 'application/json', 'x-quota-limit': '100', 'x-quota-remaining': '97' });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  _timing.pause = async () => {};   // no waiting between retries here
});
after(() => server.close());
beforeEach(() => { seen.length = 0; for (const k of Object.keys(script)) delete script[k]; });

const kl = () => new Client({ apiKey: 'kll_live_test', baseUrl: base });

test('the key goes in the header, never the URL', async () => {
  await kl().read();
  assert.equal(seen[0].path, '/v1/read');
  assert.equal(seen[0].headers.authorization, 'Bearer kll_live_test');
  assert.deepEqual(seen[0].query, {});
  assert.match(seen[0].headers['user-agent'], /^klinelens-js\//);
});

test('the key from the environment, or a clear error', async () => {
  process.env.KLINELENS_API_KEY = 'kll_live_env';
  try {
    await new Client({ baseUrl: base }).snapshot();
    assert.equal(seen[0].headers.authorization, 'Bearer kll_live_env');
  } finally { delete process.env.KLINELENS_API_KEY; }
  assert.throws(() => new Client({ baseUrl: base }), AuthError);
});

test('each method asks its endpoint with its parameters', async () => {
  const c = kl();
  const calls = [
    [() => c.forecast({ tf: '1h' }), '/v1/forecast', { tf: '1h' }],
    [() => c.flow({ window: '7d', interval: '4h' }), '/v1/flow', { window: '7d', interval: '4h' }],
    [() => c.liquidations({ window: '1h', interval: '15m', limit: 10 }), '/v1/liquidations', { window: '1h', interval: '15m', limit: '10' }],
    [() => c.whales({ minUsd: 250000 }), '/v1/whales', { window: '24h', interval: '4h', min: '250000' }],
    [() => c.book(), '/v1/book', { levels: '20' }],
    [() => c.book({ levels: 5, window: '2h', interval: '1h' }), '/v1/book', { levels: '5', window: '2h', interval: '1h' }],
    [() => c.derivatives(), '/v1/derivatives', {}],
    [() => c.setup(), '/v1/setup', {}],
    [() => c.ledger({ limit: 5 }), '/v1/ledger', { limit: '5' }],
  ];
  for (const [call, path, query] of calls) {
    seen.length = 0;
    await call();
    assert.deepEqual({ path: seen[0].path, query: seen[0].query }, { path, query }, path);
  }
});

test('a result carries data, meta and quota', async () => {
  script['/v1/liquidations'] = [[200, { data: { totals: { count: 3 } }, meta: { interval: '4h' } }]];
  const r = await kl().liquidations();
  assert.ok(r instanceof Result);
  assert.equal(r.data.totals.count, 3);
  assert.equal(r.meta.interval, '4h');
  assert.deepEqual(r.quota, { limit: 100, remaining: 97 });
});

test('null data is kept, with the reason', async () => {
  script['/v1/setup'] = [[200, { data: null, meta: { reason: 'No trade is open right now.' } }]];
  const r = await kl().setup();
  assert.equal(r.data, null);
  assert.equal(r.meta.reason, 'No trade is open right now.');
});

test('errors by status', async () => {
  for (const [status, Cls] of [[400, BadRequestError], [401, AuthError], [403, PlanError], [429, RateLimitError]]) {
    script['/v1/flow'] = [[status, { error: `said ${status}` }]];
    await assert.rejects(kl().flow(), (e) => e instanceof Cls && e instanceof KlineLensError && e.status === status && e.detail === `said ${status}`);
  }
});

test('a restart is retried, then answers', async () => {
  script['/v1/read'] = [[503, { error: 'restarting' }], [503, { error: 'restarting' }], [200, { data: { ok: 1 }, meta: {} }]];
  assert.equal((await kl().read()).data.ok, 1);
  assert.equal(seen.length, 3);
});

test('a quota refusal is not retried', async () => {
  script['/v1/read'] = [[429, { error: 'used up' }]];
  await assert.rejects(kl().read(), RateLimitError);
  assert.equal(seen.length, 1);
});

test('retries run out', async () => {
  script['/v1/read'] = [[503, { error: 'down' }]];
  await assert.rejects(kl().read(), ServiceError);
  assert.equal(seen.length, 3);
});

test('no server', async () => {
  const c = new Client({ apiKey: 'kll_live_test', baseUrl: 'http://127.0.0.1:9', retries: 0, timeoutMs: 2000 });
  await assert.rejects(c.read(), (e) => e instanceof ServiceError && e.status === null);
});

test('an answer that is not JSON', async () => {
  script['/v1/read'] = [[200, '<html>maintenance</html>']];
  await assert.rejects(kl().read(), ServiceError);
});

test('a fetch can be passed in', async () => {
  const urls = [];
  const fake = async (url, init) => { urls.push([url, init.headers.Authorization]); return new Response(JSON.stringify({ data: { x: 1 }, meta: {} }), { status: 200 }); };
  const r = await new Client({ apiKey: 'k', fetch: fake }).flow({ window: '1h' });
  assert.deepEqual(urls, [['https://klinelens.com/v1/flow?window=1h&interval=1h', 'Bearer k']]);
  assert.equal(r.data.x, 1);
});
