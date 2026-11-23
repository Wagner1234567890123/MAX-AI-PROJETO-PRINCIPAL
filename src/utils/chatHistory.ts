export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

const HISTORY_KEY = 'max_ai_chat_history_v1';
const WELCOME_TEXT =
  'Olá! Eu sou a MAX AI 👑. Posso conversar por texto ou por voz, sempre em português brasileiro. Toque no microfone e fale naturalmente comigo.';

export function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createWelcomeMessage(): ChatMessage {
  return { id: 'welcome', role: 'assistant', text: WELCOME_TEXT };
}

export function loadMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [createWelcomeMessage()];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [createWelcomeMessage()];
    const restored: ChatMessage[] = [];
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) continue;
      const candidate = item as Partial<ChatMessage>;
      if (
        (candidate.role === 'user' || candidate.role === 'assistant') &&
        typeof candidate.text === 'string' &&
        typeof candidate.id === 'string'
      ) {
        restored.push({
          id: candidate.id,
          role: candidate.role,
          text: candidate.text,
        });
      }
    }
    return restored.length > 0 ? restored.slice(-40) : [createWelcomeMessage()];
  } catch {
    return [createWelcomeMessage()];
  }
}

export function saveMessages(messages: ChatMessage[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-40)));
  } catch {}
}
