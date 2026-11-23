export interface AuthUser {
  id: string;
  email?: string;
  phoneNumber?: string;
  name: string;
  plan: string | null;
}

const TOKEN_KEY = 'max_ai_token';
const USER_KEY = 'max_ai_user';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function storeSession(token: string, user: AuthUser): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // storage indisponível — ignora
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    // ignora
  }
}

const SERVER_URL_KEY = 'max_ai_server_url_v1';

function normalizeApiBase(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function getApiBase(): string {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const configured = normalizeApiBase(env?.VITE_API_URL || env?.VITE_APP_URL || '');
  if (configured) return configured;
  try {
    return normalizeApiBase(localStorage.getItem(SERVER_URL_KEY) || '');
  } catch {
    return '';
  }
}

export function getApiBaseUrl(): string {
  return getApiBase();
}

export function setApiBaseUrl(value: string): string {
  const normalized = normalizeApiBase(value);
  try {
    if (normalized) localStorage.setItem(SERVER_URL_KEY, normalized);
    else localStorage.removeItem(SERVER_URL_KEY);
  } catch {
    // A configuração em memória/build continua disponível mesmo sem storage.
  }
  return normalized;
}

async function request(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${getApiBase()}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Erro na requisição.');
  }
  return data;
}

export async function apiRegister(email: string, password: string, name: string) {
  return request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
  });
}

export async function apiLogin(email: string, password: string) {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function apiGoogleLogin(idToken: string) {
  return request('/api/auth/google', {
    method: 'POST',
    body: JSON.stringify({ idToken }),
  });
}

export async function apiPhoneLogin(idToken: string) {
  return request('/api/auth/phone', {
    method: 'POST',
    body: JSON.stringify({ idToken }),
  });
}

export async function apiMe(token: string) {
  return request('/api/auth/me', {}, token);
}

export async function apiLogout(token: string) {
  return request('/api/auth/logout', { method: 'POST' }, token);
}


