// Teste real de conectividade do backend MAX AI com a API do Google Gemini.
// Uso: node scripts/test_gemini_connection.mjs [chave]
// Sem chave, usa uma chave inválida para provar que a requisição chega ao Google.
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const key = process.argv[2] || process.env.GEMINI_API_KEY || 'INVALID_TEST_KEY';
const PORT = 3101;

const server = spawn('node', ['server.cjs'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(PORT), GEMINI_API_KEY: key },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverLog = '';
server.stderr.on('data', (d) => (serverLog += d.toString()));
server.stdout.on('data', (d) => (serverLog += d.toString()));

async function waitForServer() {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (r.ok) return true;
    } catch {}
    await sleep(300);
  }
  return false;
}

const base = `http://127.0.0.1:${PORT}`;

try {
  const up = await waitForServer();
  console.log('1) Backend iniciado:', up ? 'SIM' : 'NÃO');

  if (up) {
    const health = await fetch(`${base}/health`);
    console.log('2) GET /health ->', health.status, (await health.text()).slice(0, 120));

    const ai = await fetch(`${base}/api/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', text: 'Olá, MAX AI. Responda apenas: OK.' }] }),
    });
    const aiText = await ai.text();
    console.log('3) POST /api/ai -> status', ai.status);
    console.log('   Resposta do backend:', aiText.slice(0, 300));
  }
} finally {
  server.kill('SIGTERM');
  await sleep(300);
}
