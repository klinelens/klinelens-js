export declare const VERSION: string;
export declare const DEFAULT_BASE_URL: string;

export type Window = `${number}${'m' | 'h' | 'd'}`;
export type Interval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export interface ClientOptions {
  /** Your key; defaults to the KLINELENS_API_KEY environment variable. */
  apiKey?: string;
  baseUrl?: string;
  /** Per request; default 15 000. */
  timeoutMs?: number;
  /** Retries on a restart or no connection; default 2. */
  retries?: number;
  /** A fetch to use in place of the global one. */
  fetch?: typeof fetch;
}

export interface Quota {
  limit: number | null;
  remaining: number | null;
}

export interface Meta {
  version?: 'v1';
  generatedAt?: string;
  note?: string;
  window?: { from: string; to: string };
  interval?: string;
  historyFrom?: string | null;
  gaps?: { from: string; to: string }[];
  plan?: { historyDays: number; smallestInterval: string; events: number };
  reason?: string;
  [key: string]: unknown;
}

export declare class Result<T = any> {
  data: T;
  meta: Meta;
  quota: Quota;
}

export interface Totals { [key: string]: number }
export interface Event { at: string; side: string; price: number; usd: number }

export interface FlowPoint {
  at: string; buyUsd: number; sellUsd: number; deltaUsd: number; cumulativeUsd: number;
  buyBtc: number; sellBtc: number; trades: number; complete: boolean;
}
export interface Flow { points: FlowPoint[]; totals: { buyUsd: number; sellUsd: number; deltaUsd: number } }
export interface Liquidations {
  points: { at: string; longUsd: number; shortUsd: number; count: number }[];
  totals: { longUsd: number; shortUsd: number; count: number };
  events: Event[];
}
export interface Whales {
  minUsd: number;
  points: { at: string; buyUsd: number; sellUsd: number; netUsd: number; count: number }[];
  totals: { buyUsd: number; sellUsd: number; netUsd: number; count: number };
  events: Event[];
}
export interface BookNow {
  at: string; mid: number; spread: number; imbalancePct: number;
  bidWall: { price: number; qty: number } | null; askWall: { price: number; qty: number } | null;
  bands: { bid: number[]; ask: number[] }; reachPct: { bid: number; ask: number };
  bids: [number, number][]; asks: [number, number][];
}
export interface Book { now: BookNow | null; history: Record<string, unknown>[] | null }
export interface DerivativesNow {
  at: string; fundingRate: number; nextFundingAt: string | null; openInterestBtc: number; openInterestUsd: number;
  markPrice: number; indexPrice: number; lastPrice: number; basisPct: number | null;
}
export interface Derivatives { now: DerivativesNow | null; history: Record<string, unknown>[] | null }
export interface Snapshot {
  lastHour: { flow: Flow['totals']; liquidations: Liquidations['totals']; whales: Whales['totals'] };
  book: BookNow | null;
  derivatives: DerivativesNow | null;
}

export declare class Client {
  constructor(options?: ClientOptions);
  baseUrl: string;
  timeoutMs: number;
  retries: number;
  read(): Promise<Result>;
  forecast(options?: { tf?: '5m' | '15m' | '1h' }): Promise<Result>;
  snapshot(): Promise<Result<Snapshot>>;
  flow(options?: { window?: Window; interval?: Interval }): Promise<Result<Flow>>;
  liquidations(options?: { window?: Window; interval?: Interval; limit?: number }): Promise<Result<Liquidations>>;
  whales(options?: { window?: Window; interval?: Interval; minUsd?: number; limit?: number }): Promise<Result<Whales>>;
  book(options?: { levels?: number; window?: Window; interval?: Interval }): Promise<Result<Book>>;
  derivatives(options?: { window?: Window; interval?: Interval }): Promise<Result<Derivatives>>;
  setup(): Promise<Result<Record<string, unknown> | null>>;
  ledger(options?: { limit?: number }): Promise<Result>;
}

export declare class KlineLensError extends Error {
  status: number | null;
  detail: string;
  headers: Headers | null;
}
export declare class BadRequestError extends KlineLensError {}
export declare class AuthError extends KlineLensError {}
export declare class PlanError extends KlineLensError {}
export declare class NotFoundError extends KlineLensError {}
export declare class RateLimitError extends KlineLensError {}
export declare class ServiceError extends KlineLensError {}
