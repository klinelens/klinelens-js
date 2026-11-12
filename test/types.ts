// Compiled, never run: the published types describe the client as it is used.
import { Client, PlanError, type Flow, type Result } from '../src/index.js';

async function check(): Promise<void> {
  const kl = new Client({ apiKey: 'kll_live_x', timeoutMs: 5000 });
  const flow: Result<Flow> = await kl.flow({ window: '24h', interval: '1h' });
  const last: number | undefined = flow.data.points.at(-1)?.cumulativeUsd;
  const remaining: number | null = flow.quota.remaining;
  const liq = await kl.liquidations({ window: '1h', limit: 10 });
  const side: string | undefined = liq.data.events[0]?.side;
  const book = await kl.book({ levels: 5 });
  const mid: number | undefined = book.data.now?.mid;
  try { await kl.flow({ window: '30d', interval: '1m' }); } catch (e) { if (e instanceof PlanError) console.log(e.status, e.detail); }
  console.log(last, remaining, side, mid);
}
void check;
