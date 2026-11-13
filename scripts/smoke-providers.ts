// Uso manual: npx tsx scripts/smoke-providers.ts  (chaves em .env.local)
import { existsSync } from 'node:fs';
import { getCatalog, resolveKey } from '../src/providers/catalog';
import { chat } from '../src/providers/client';
import { PROVIDERS } from '../src/providers/table';
import type { ProviderId } from '../src/types';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

async function main() {
  const { models, errors } = await getCatalog({});
  for (const e of errors) console.log(`[${e.provider}] ERRO listando modelos: ${e.message}`);
  for (const p of Object.keys(PROVIDERS) as ProviderId[]) {
    const apiKey = resolveKey(p, {});
    if (!apiKey) {
      console.log(`[${p}] sem chave, ignorado`);
      continue;
    }
    const mine = models.filter((m) => m.provider === p);
    const free = mine.filter((m) => m.free);
    console.log(`[${p}] ${mine.length} modelos (${free.length} gratuitos). Amostra:`, mine.slice(0, 5).map((m) => m.id));
    const model = (free[0] ?? mine[0])?.id;
    if (!model) continue;
    const t0 = Date.now();
    try {
      let text = '';
      for await (const t of chat({
        provider: p,
        model,
        apiKey,
        maxTokens: 60,
        messages: [{ role: 'user', content: 'Diga uma frase curta em português.' }],
      })) text += t;
      console.log(`[${p}] ok ${model} ${Date.now() - t0}ms: ${text.trim()}`);
    } catch (e) {
      console.log(`[${p}] ERRO ${model} status=${(e as { status?: number }).status ?? '?'}: ${(e as Error).message}`);
    }
  }
}

main();
