// Prints the last hour's taker delta every minute: who is pushing, buyers or sellers.
import { Client } from 'klinelens';

const kl = new Client();
const tick = async () => {
  const { data } = await kl.flow({ window: '1h', interval: '5m' });
  const d = data.totals.deltaUsd;
  console.log(`${new Date().toISOString().slice(11, 16)} UTC  takers ${d >= 0 ? 'bought' : 'sold'} $${(Math.abs(d) / 1e6).toFixed(1)}M more than they ${d >= 0 ? 'sold' : 'bought'} in the last hour`);
};
await tick();
setInterval(() => tick().catch((e) => console.error(e.message)), 60_000);
