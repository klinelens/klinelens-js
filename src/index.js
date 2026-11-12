// The K-Line Lens API client for JavaScript: one method per /v1 endpoint.
// No dependencies; it needs a global fetch (Node 18+, Deno, Bun).

export const VERSION = '0.1.0';
export const DEFAULT_BASE_URL = 'https://klinelens.com';

const RETRY_STATUS = new Set([502, 503, 504]);

/** An answer that is not data. `status` is the HTTP status, or null if the API was not reached. */
export class KlineLensError extends Error {
  constructor(status, message, headers = null) {
    super(status ? `${status}: ${message}` : message);
    this.name = new.target.name;
    this.status = status;
    this.detail = message;
    this.headers = headers;
  }
}
/** 400: a parameter is wrong; the message says which. */
export class BadRequestError extends KlineLensError {}
/** 401: no key, or not a valid one. */
export class AuthError extends KlineLensError {}
/** 403: outside your plan (more history, a smaller interval or another timeframe). */
export class PlanError extends KlineLensError {}
/** 404: no such endpoint. */
export class NotFoundError extends KlineLensError {}
/** 429: today's requests are used up. They reset at 00:00 UTC. */
export class RateLimitError extends KlineLensError {}
/** 5xx, or the API could not be reached. Retried before it is thrown. */
export class ServiceError extends KlineLensError {}

const ERRORS = { 400: BadRequestError, 401: AuthError, 403: PlanError, 404: NotFoundError, 429: RateLimitError };

const int = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

/** What every call returns: the data, its meta and today's quota. */
export class Result {
  constructor(body, headers) {
    this.data = body?.data ?? null;
    this.meta = body?.meta ?? {};
    this.quota = { limit: int(headers?.get?.('x-quota-limit')), remaining: int(headers?.get?.('x-quota-remaining')) };
  }
}

export class Client {
  /**
   * @param {object} [options]
   * @param {string} [options.apiKey] Your key; defaults to the KLINELENS_API_KEY environment variable.
   * @param {string} [options.baseUrl]
   * @param {number} [options.timeoutMs] Per request, default 15 000.
   * @param {number} [options.retries] Retries on a restart or no connection, default 2.
   * @param {typeof fetch} [options.fetch] A fetch to use in place of the global one.
   */
  constructor({ apiKey, baseUrl = DEFAULT_BASE_URL, timeoutMs = 15_000, retries = 2, fetch: fetchImpl } = {}) {
    const key = apiKey ?? globalThis.process?.env?.KLINELENS_API_KEY;
    if (!key) throw new AuthError(401, 'No API key. Pass { apiKey } or set KLINELENS_API_KEY. Create one at https://klinelens.com/api.');
    this.#key = key;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.timeoutMs = timeoutMs;
    this.retries = Math.max(0, retries | 0);
    this.#fetch = fetchImpl ?? globalThis.fetch;
    if (typeof this.#fetch !== 'function') throw new KlineLensError(null, 'No fetch available. Use Node 18 or later, or pass { fetch }.');
  }

  #key;
  #fetch;

  // ------------------------------------------------------------ the read

  /** The read right now: the lean, how its readings vote, each one's side. */
  read() { return this.#get('/v1/read'); }

  /** The forecast model's latest call for `tf` (5m, 15m or 1h; Free reads 15m). */
  forecast({ tf = '15m' } = {}) { return this.#get('/v1/forecast', { tf }); }

  // ------------------------------------------------------------ market data

  /** The last hour's flow, liquidations and large trades, the book and derivatives now. */
  snapshot() { return this.#get('/v1/snapshot'); }

  /** Taker buying and selling per interval, with the running delta (CVD). */
  flow({ window = '24h', interval = '1h' } = {}) { return this.#get('/v1/flow', { window, interval }); }

  /** Longs and shorts forced closed per interval, and the latest single ones. */
  liquidations({ window = '24h', interval = '4h', limit } = {}) { return this.#get('/v1/liquidations', { window, interval, limit }); }

  /** Large single trades ($50,000 and up, or `minUsd`) per interval, and the latest ones. */
  whales({ window = '24h', interval = '4h', minUsd, limit } = {}) { return this.#get('/v1/whales', { window, interval, min: minUsd, limit }); }

  /** The order book as of the last minute; with `window`, its history too. */
  book({ levels = 20, window, interval } = {}) { return this.#get('/v1/book', { levels, window, interval }); }

  /** Funding, open interest, mark and index now; with `window`, their history too. */
  derivatives({ window, interval } = {}) { return this.#get('/v1/derivatives', { window, interval }); }

  // ------------------------------------------------------------ the ledger

  /** The ledger's open trade, or `data` null when none is open (`meta.reason`). */
  setup() { return this.#get('/v1/setup'); }

  /** The ledger's account, totals and latest trades, newest first. */
  ledger({ limit } = {}) { return this.#get('/v1/ledger', { limit }); }

  // ------------------------------------------------------------ transport

  async #get(path, params = {}) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v != null) q.set(k, String(v));
    const qs = q.toString();
    const url = `${this.baseUrl}${path}${qs ? `?${qs}` : ''}`;
    const headers = { Authorization: `Bearer ${this.#key}`, Accept: 'application/json', 'User-Agent': `klinelens-js/${VERSION}` };
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await this.#fetch(url, { headers, signal: AbortSignal.timeout(this.timeoutMs) });
      } catch (err) {
        if (attempt < this.retries) { await pause(attempt + 1); continue; }
        throw new ServiceError(null, `Could not reach ${this.baseUrl}: ${err?.message ?? err}`);
      }
      const body = await res.json().catch(() => null);
      if (res.ok) {
        if (!body || typeof body !== 'object') throw new ServiceError(res.status, 'The API answered with something that is not JSON.');
        return new Result(body, res.headers);
      }
      if (RETRY_STATUS.has(res.status) && attempt < this.retries) { await pause(attempt + 1); continue; }
      const Cls = ERRORS[res.status] ?? (res.status >= 500 ? ServiceError : KlineLensError);
      throw new Cls(res.status, body?.error ?? `HTTP ${res.status}`, res.headers);
    }
  }
}

// Exposed for the tests, which do not wait between retries.
export const _timing = { pause: (attempt) => new Promise((r) => setTimeout(r, Math.min(8000, 500 * 2 ** (attempt - 1)) + Math.random() * 250)) };
const pause = (attempt) => _timing.pause(attempt);
