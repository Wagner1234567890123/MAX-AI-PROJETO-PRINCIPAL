import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 3010;
const BASE = `http://127.0.0.1:${PORT}`;
const testDataDir = mkdtempSync(join(tmpdir(), 'fire-max-test-'));

const server = spawn('node', ['server.cjs'], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR: testDataDir },
  stdio: 'ignore',
});

async function waitForServer() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error('Backend não iniciou a tempo');
}

async function call(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: r.status, json };
}

try {
  await waitForServer();

  // CORS preflight: the Android WebView must be able to send GET + Bearer Authorization.
  const preflight = await fetch(`${BASE}/api/auth/me`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'capacitor://localhost',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization,content-type',
    },
  });
  const allowedMethods = preflight.headers.get('access-control-allow-methods') || '';
  const allowedHeaders = preflight.headers.get('access-control-allow-headers') || '';
  if (
    preflight.status !== 204 ||
    !allowedMethods.includes('GET') ||
    !allowedHeaders.toLowerCase().includes('authorization')
  ) {
    throw new Error('preflight CORS não permite GET/Authorization');
  }
  console.log('CORS preflight ->', preflight.status, allowedMethods, allowedHeaders);

  // 1. Register
  const reg = await call('POST', '/api/auth/register', {
    email: 'teste@exemplo.com',
    password: 'segredo123',
    name: 'Teste',
  });
  if (reg.status !== 201 || !reg.json?.token) throw new Error(`register falhou: ${reg.status}`);
  console.log('1) register ->', reg.status, reg.json.user.email);
  const token = reg.json.token;

  // 2. Duplicate register
  const dup = await call('POST', '/api/auth/register', {
    email: 'teste@exemplo.com',
    password: 'segredo123',
  });
  if (dup.status !== 409) throw new Error(`registro duplicado deveria retornar 409, retornou ${dup.status}`);
  console.log('2) register duplicado ->', dup.status, dup.json?.error);

  // 3. Login correto
  const login = await call('POST', '/api/auth/login', {
    email: 'teste@exemplo.com',
    password: 'segredo123',
  });
  if (login.status !== 200) throw new Error(`login falhou: ${login.status}`);
  console.log('3) login ->', login.status, login.json?.user?.email || login.json?.error);

  // 4. Login senha errada
  const badLogin = await call('POST', '/api/auth/login', {
    email: 'teste@exemplo.com',
    password: 'errada',
  });
  if (badLogin.status !== 401) throw new Error(`senha incorreta deveria retornar 401, retornou ${badLogin.status}`);
  console.log('4) login senha errada ->', badLogin.status, badLogin.json?.error);

  // 5. Me com token
  const me = await call('GET', '/api/auth/me', null, token);
  if (me.status !== 200) throw new Error(`me autenticado falhou: ${me.status}`);
  console.log('5) me (token) ->', me.status, me.json?.user?.email || me.json?.error);

  // 6. Me sem token
  const meNoToken = await call('GET', '/api/auth/me');
  if (meNoToken.status !== 401) throw new Error(`me sem token deveria retornar 401, retornou ${meNoToken.status}`);
  console.log('6) me (sem token) ->', meNoToken.status, meNoToken.json?.error);

  // 13. Logout
  const logout = await call('POST', '/api/auth/logout', null, token);
  console.log('13) logout ->', logout.status, logout.json?.ok);

  // 14. Me após logout
  const meAfterLogout = await call('GET', '/api/auth/me', null, token);
  if (meAfterLogout.status !== 401) throw new Error(`sessão deveria estar encerrada, retornou ${meAfterLogout.status}`);
  console.log('14) me após logout ->', meAfterLogout.status, meAfterLogout.json?.error);
  console.log('SUCESSO: todos os testes automatizados passaram. O webhook acima é apenas uma simulação de teste.');
} catch (err) {
  console.error('FALHA:', err.message);
  process.exitCode = 1;
} finally {
  server.kill();
  rmSync(testDataDir, { recursive: true, force: true });
}
