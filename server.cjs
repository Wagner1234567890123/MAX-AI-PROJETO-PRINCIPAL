const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
require('dotenv').config();

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0';
const ROOT = path.join(__dirname, 'dist');
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const GEMINI_FALLBACK_MODELS = ['gemini-3.8-flash', 'gemini-3-flash-preview'];
const GEMINI_ENDPOINT =
  process.env.GEMINI_API_ENDPOINT ||
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_MESSAGES = 20;
const MAX_TEXT_LENGTH = 4000;
const MAX_BODY_LENGTH = 120000;
const SYSTEM_INSTRUCTION = `Você é a MAX AI 👑, assistente conversacional integrada ao aplicativo MAX PERFORMANCE.
Responda sempre em português brasileiro, de forma natural, direta e adequada para ser falada em voz alta.
Use frases curtas e conversacionais. Evite markdown, tabelas, links longos e listas extensas.
Quando o usuário falar, responda como em uma conversa: cumprimente, confirme e dê uma resposta útil em até três frases.
Se não souber algo, diga isso com sinceridade e ofereça um próximo passo simples.`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...CORS_HEADERS,
  });
  res.end(JSON.stringify(body));
}

function sendFile(res, filePath, statusCode = 200) {
  const ext = path.extname(filePath).toLowerCase();
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Erro ao ler arquivo.');
  });
  res.writeHead(statusCode, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  stream.pipe(res);
}

function normalizeMessages(payload) {
  if (!payload || !Array.isArray(payload.messages)) return [];
  return payload.messages
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      role: item.role === 'assistant' ? 'model' : item.role === 'user' ? 'user' : null,
      text: typeof item.text === 'string' ? item.text.trim().slice(0, MAX_TEXT_LENGTH) : '',
    }))
    .filter((item) => item.role && item.text)
    .slice(-MAX_MESSAGES);
}

async function handleAiRequest(req, res) {
  let raw = '';
  try {
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > MAX_BODY_LENGTH) {
        sendJson(res, 413, { error: 'Mensagem muito longa.' });
        return;
      }
    }
  } catch {
    sendJson(res, 400, { error: 'Não foi possível ler a solicitação.' });
    return;
  }

  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    sendJson(res, 400, { error: 'Solicitação inválida.' });
    return;
  }

  const messages = normalizeMessages(payload);
  if (messages.length === 0) {
    sendJson(res, 400, { error: 'Nenhuma mensagem válida foi enviada.' });
    return;
  }

  const firstUserIndex = messages.findIndex((message) => message.role === 'user');
  if (firstUserIndex < 0) {
    sendJson(res, 400, { error: 'Envie uma mensagem do usuário para iniciar a conversa.' });
    return;
  }
  const contents = messages.slice(firstUserIndex);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    sendJson(res, 503, { error: 'GEMINI_API_KEY não configurada no servidor da MAX AI.' });
    return;
  }

  const requestBody = JSON.stringify({
    contents: contents.map((message) => ({
      role: message.role,
      parts: [{ text: message.text }],
    })),
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    generationConfig: { maxOutputTokens: 1024 },
  });

  const endpointsToTry = [GEMINI_ENDPOINT];
  if (!process.env.GEMINI_API_ENDPOINT) {
    for (const model of GEMINI_FALLBACK_MODELS) {
      if (model === GEMINI_MODEL) continue;
      endpointsToTry.push(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
      );
    }
  }

  try {
    let response = null;
    let lastStatus = null;
    for (const endpoint of endpointsToTry) {
      const attempt = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: requestBody,
        signal: AbortSignal.timeout(30000),
      });
      if (attempt.ok) {
        response = attempt;
        break;
      }
      lastStatus = attempt.status;
      const providerError = await attempt.json().catch(() => null);
      const providerMessage =
        typeof providerError?.error?.message === 'string'
          ? providerError.error.message.slice(0, 400)
          : 'Sem detalhes fornecidos pelo provedor.';
      console.warn(`[MAX AI] Gemini HTTP ${lastStatus}: ${providerMessage}`);
      if (attempt.status !== 404 || process.env.GEMINI_API_ENDPOINT) {
        break;
      }
    }

    if (!response || !response.ok) {
      sendJson(res, 502, { error: `Falha ao consultar o Google Gemini (HTTP ${lastStatus || 502}). Confira o modelo, a chave, a cota e a configuração do servidor.` });
      return;
    }

    const data = await response.json();
    const text = (data?.candidates?.[0]?.content?.parts || [])
      .filter((part) => part && typeof part.text === 'string')
      .map((part) => part.text)
      .join('')
      .trim();

    if (!text) {
      sendJson(res, 502, { error: 'A API de IA não retornou uma resposta de texto.' });
      return;
    }

    sendJson(res, 200, { text });
  } catch (err) {
    console.warn('[MAX AI] Falha de comunicação com o Gemini:', err?.name || 'erro desconhecido');
    sendJson(res, 502, {
      error:
        err && err.name === 'TimeoutError'
          ? 'A API de IA demorou para responder.'
          : 'Não foi possível contatar a API de IA.',
    });
  }
}

// ===== Persistência de dados =====
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
function loadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}
function saveJson(file, data) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ===== Segurança de senha e sessões =====
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
}
function createToken() {
  return crypto.randomBytes(32).toString('hex');
}
function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    phoneNumber: user.phoneNumber || null,
    name: user.name,
    plan: user.plan || null,
    createdAt: user.createdAt,
  };
}
function getUserByToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const sessions = loadJson(SESSIONS_FILE, {});
  const userId = sessions[token];
  if (!userId) return null;
  const users = loadJson(USERS_FILE, []);
  return users.find((u) => u.id === userId) || null;
}

// ===== Leitura de corpo JSON =====
async function readBody(req, maxBytes = 200000) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > maxBytes) {
      const err = new Error('Corpo muito grande');
      err.status = 413;
      throw err;
    }
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error('Solicitação inválida');
    err.status = 400;
    throw err;
  }
}


function getFirebaseAdminAuth() {
  const { getApps, initializeApp, applicationDefault } = require('firebase-admin/app');
  const { getAuth } = require('firebase-admin/auth');
  const app = getApps().find((item) => item.name === '[DEFAULT]') ||
    initializeApp({
      credential: applicationDefault(),
      projectId: 'max-performance-552ca',
    });
  return getAuth(app);
}

async function handlePhoneAuth(req, res) {
  const payload = await readBody(req);
  const idToken = String(payload.idToken || '').trim();
  if (!idToken) return sendJson(res, 400, { error: 'Token de telefone ausente.' });

  let decoded;
  try {
    decoded = await getFirebaseAdminAuth().verifyIdToken(idToken);
  } catch {
    return sendJson(res, 401, { error: 'Token de telefone inválido ou Firebase Admin não configurado.' });
  }

  const firebaseUid = String(decoded.uid || '');
  const phoneNumber = String(decoded.phone_number || '').trim();
  if (!firebaseUid || !phoneNumber) {
    return sendJson(res, 401, { error: 'O Firebase não confirmou um número de telefone.' });
  }

  const users = loadJson(USERS_FILE, []);
  let user = users.find((item) => item.firebaseUid === firebaseUid);
  let changed = false;

  if (!user) {
    user = users.find((item) => item.phoneNumber === phoneNumber);
    if (user && user.firebaseUid && user.firebaseUid !== firebaseUid) {
      return sendJson(res, 409, { error: 'Este telefone já está vinculado a outra conta.' });
    }
  }

  if (user) {
    if (user.firebaseUid !== firebaseUid) {
      user.firebaseUid = firebaseUid;
      changed = true;
    }
    if (user.phoneNumber !== phoneNumber) {
      user.phoneNumber = phoneNumber;
      changed = true;
    }
    if (user.authProvider !== 'phone') {
      user.authProvider = 'phone';
      changed = true;
    }
  } else {
    user = {
      id: createToken().slice(0, 16),
      name: 'Usuário',
      phoneNumber,
      firebaseUid,
      authProvider: 'phone',
      createdAt: new Date().toISOString(),
      plan: null,
      voiceUsedToday: 0,
      voiceDay: null,
    };
    users.push(user);
    changed = true;
  }

  if (changed) saveJson(USERS_FILE, users);

  const token = createToken();
  const sessions = loadJson(SESSIONS_FILE, {});
  sessions[token] = user.id;
  saveJson(SESSIONS_FILE, sessions);
  return sendJson(res, 200, { token, user: publicUser(user) });
}

async function handleGoogleAuth(req, res) {
  const payload = await readBody(req);
  const idToken = String(payload.idToken || '').trim();
  if (!idToken) return sendJson(res, 400, { error: 'Token Google ausente.' });

  let decoded;
  try {
    decoded = await getFirebaseAdminAuth().verifyIdToken(idToken);
  } catch {
    return sendJson(res, 401, { error: 'Token Google inválido ou Firebase Admin não configurado.' });
  }

  const email = String(decoded.email || '').trim().toLowerCase();
  const firebaseUid = String(decoded.uid || '');
  if (!email || decoded.email_verified !== true || !firebaseUid) {
    return sendJson(res, 401, { error: 'Conta Google sem e-mail verificado.' });
  }

  const users = loadJson(USERS_FILE, []);
  let user = users.find((item) => item.firebaseUid === firebaseUid);
  let changed = false;

  if (!user) {
    user = users.find((item) => item.email === email);
    if (user && user.firebaseUid && user.firebaseUid !== firebaseUid) {
      return sendJson(res, 409, { error: 'Esta conta já está vinculada a outro acesso Google.' });
    }
    if (user) {
      user.firebaseUid = firebaseUid;
      user.authProvider = 'google';
      changed = true;
    } else {
      user = {
        id: createToken().slice(0, 16),
        email,
        name: String(decoded.name || email.split('@')[0]).trim(),
        firebaseUid,
        authProvider: 'google',
        createdAt: new Date().toISOString(),
        plan: null,
        voiceUsedToday: 0,
        voiceDay: null,
      };
      users.push(user);
      changed = true;
    }
  }

  if (changed) saveJson(USERS_FILE, users);

  const token = createToken();
  const sessions = loadJson(SESSIONS_FILE, {});
  sessions[token] = user.id;
  saveJson(SESSIONS_FILE, sessions);
  return sendJson(res, 200, { token, user: publicUser(user) });
}

// ===== Autenticação =====
async function handleRegister(req, res) {
  const payload = await readBody(req);
  const email = String(payload.email || '').trim().toLowerCase();
  const password = String(payload.password || '');
  const name = String(payload.name || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return sendJson(res, 400, { error: 'E-mail inválido.' });
  }
  if (password.length < 6) {
    return sendJson(res, 400, { error: 'A senha deve ter ao menos 6 caracteres.' });
  }
  const users = loadJson(USERS_FILE, []);
  if (users.some((u) => u.email === email)) {
    return sendJson(res, 409, { error: 'Este e-mail já está cadastrado.' });
  }
  const user = {
    id: createToken().slice(0, 16),
    email,
    name: name || email.split('@')[0],
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
    plan: null,
    voiceUsedToday: 0,
    voiceDay: null,
  };
  users.push(user);
  saveJson(USERS_FILE, users);
  const token = createToken();
  const sessions = loadJson(SESSIONS_FILE, {});
  sessions[token] = user.id;
  saveJson(SESSIONS_FILE, sessions);
  sendJson(res, 201, { token, user: publicUser(user) });
}

async function handleLogin(req, res) {
  const payload = await readBody(req);
  const email = String(payload.email || '').trim().toLowerCase();
  const password = String(payload.password || '');
  const users = loadJson(USERS_FILE, []);
  const user = users.find((u) => u.email === email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return sendJson(res, 401, { error: 'E-mail ou senha incorretos.' });
  }
  const token = createToken();
  const sessions = loadJson(SESSIONS_FILE, {});
  sessions[token] = user.id;
  saveJson(SESSIONS_FILE, sessions);
  sendJson(res, 200, { token, user: publicUser(user) });
}

function handleMe(req, res) {
  const user = getUserByToken(req);
  if (!user) return sendJson(res, 401, { error: 'Não autenticado.' });
  sendJson(res, 200, { user: publicUser(user) });
}

function handleLogout(req, res) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token) {
    const sessions = loadJson(SESSIONS_FILE, {});
    delete sessions[token];
    saveJson(SESSIONS_FILE, sessions);
  }
  sendJson(res, 200, { ok: true });
}

const server = http.createServer(async (req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const routeHandlers = [
    ['POST', '/api/auth/register', handleRegister],
    ['POST', '/api/auth/login', handleLogin],
    ['POST', '/api/auth/google', handleGoogleAuth],
    ['POST', '/api/auth/phone', handlePhoneAuth],
    ['GET', '/api/auth/me', handleMe],
    ['POST', '/api/auth/logout', handleLogout],
    ['POST', '/api/ai', handleAiRequest],
  ];
  for (const [method, route, handler] of routeHandlers) {
    if (req.method === method && urlPath === route) {
      try {
        await handler(req, res);
      } catch (err) {
        sendJson(res, err && err.status ? err.status : 400, {
          error: err instanceof Error ? err.message : 'Erro no servidor.',
        });
      }
      return;
    }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Método não permitido.');
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'ok', app: 'MAX PERFORMANCE' }));
    return;
  }

  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const candidate = path.join(ROOT, safePath);

  if (!candidate.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Acesso negado.');
    return;
  }

  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    sendFile(res, candidate);
    return;
  }

  const indexFile = path.join(ROOT, 'index.html');
  if (fs.existsSync(indexFile)) {
    sendFile(res, indexFile);
    return;
  }

  res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Build ausente: rode "npm run build".');
});

server.listen(PORT, HOST, () => {
  console.log(`MAX PERFORMANCE servindo em http://${HOST}:${PORT}`);
});
