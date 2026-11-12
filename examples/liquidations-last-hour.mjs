// Who was forced out in the last hour, and the biggest single liquidations.
import { Client } from 'klinelens';

const kl = new Client(); // reads KLINELENS_API_KEY
const res = await kl.liquidations({ window: '1h', interval: '15m', limit: 10 });
const t = res.data.totals;
console.log(`Last hour: $${Math.round(t.longUsd).toLocaleString()} of longs and $${Math.round(t.shortUsd).toLocaleString()} of shorts liquidated (${t.count} in all)`);
for (const e of res.data.events) console.log(`  ${e.at.slice(11, 19)}  ${e.side.padEnd(5)}  $${Math.round(e.usd).toLocaleString().padStart(10)}  at $${e.price}`);
console.log(`Requests left today: ${res.quota.remaining}`);
