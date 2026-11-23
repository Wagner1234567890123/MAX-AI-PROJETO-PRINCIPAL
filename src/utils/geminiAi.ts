export interface GeminiChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

const SERVER_URL_KEY = 'max_ai_server_url_v1';
const metaEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const RAW_APP_URL = metaEnv?.VITE_APP_URL || '';

function normalizeServerUrl(value: string): string {
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

export const AI_SERVER_URL = normalizeServerUrl(RAW_APP_URL);
let runtimeServerUrl: string | null = null;

export function getAiServerUrl(): string {
  if (runtimeServerUrl !== null) return runtimeServerUrl;
  try {
    runtimeServerUrl = normalizeServerUrl(localStorage.getItem(SERVER_URL_KEY) || '');
  } catch {
    runtimeServerUrl = '';
  }
  return runtimeServerUrl;
}

export function setAiServerUrl(value: string): string {
  const normalized = normalizeServerUrl(value);
  runtimeServerUrl = normalized;
  try {
    if (normalized) localStorage.setItem(SERVER_URL_KEY, normalized);
    else localStorage.removeItem(SERVER_URL_KEY);
  } catch {}
  return normalized;
}

export function getAiEndpoint(): string {
  const base = AI_SERVER_URL || getAiServerUrl();
  return base ? `${base}/api/ai` : '/api/ai';
}

export async function askGemini(
  messages: GeminiChatMessage[],
  signal?: AbortSignal
): Promise<string> {
  const body = {
    messages: messages
      .filter((message) => message.text.trim().length > 0)
      .slice(-20)
      .map((message) => ({
        role: message.role,
        text: message.text.trim().slice(0, 4000),
      })),
  };

  const response = await fetch(getAiEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  const rawBody = await response.text();
  let data: { text?: string; error?: string } = {};
  try {
    data = rawBody ? (JSON.parse(rawBody) as { text?: string; error?: string }) : {};
  } catch {}

  if (!response.ok) {
    throw new Error(data.error || `Servidor MAX AI retornou status ${response.status}.`);
  }

  const text = data.text?.trim();
  if (!text) {
    throw new Error('A MAX AI não retornou uma resposta. Tente novamente.');
  }
  return text;
}
