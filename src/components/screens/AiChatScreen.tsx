import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  Copy,
  Keyboard,
  Mic,
  MicOff,
  Send,
  Share2,
  Sparkles,
  Square,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  User,
  Volume2,
} from 'lucide-react';
import { GoldCrownIcon } from '../Icons';
import {
  createId,
  createWelcomeMessage,
  loadMessages,
  saveMessages,
  type ChatMessage,
} from '../../utils/chatHistory';
import {
  AI_SERVER_URL,
  askGemini,
  getAiServerUrl,
  setAiServerUrl,
  type GeminiChatMessage,
} from '../../utils/geminiAi';
import { isNativeAndroid } from '../../utils/nativeOverlay';
import {
  createRecognition,
  speakText,
  stopSpeechSynthesis,
  type SpeechRecognitionErrorEventLike,
  type SpeechRecognitionEventLike,
  type SpeechRecognitionLike,
} from '../../utils/voice';

type ChatMode = 'text' | 'voice';
type ChatStatus = 'idle' | 'listening' | 'thinking' | 'speaking';

export const AiChatScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<ChatMode>('text');
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [serverUrlInput, setServerUrlInput] = useState(() => getAiServerUrl());
  const [serverUrlSaved, setServerUrlSaved] = useState(false);
  const [feedback, setFeedback] = useState<Record<string, 'up' | 'down' | null>>({});
  const [listeningMessageId, setListeningMessageId] = useState<string | null>(null);
  const effectiveServerUrl = AI_SERVER_URL || getAiServerUrl();
  const geminiReady = !isNativeAndroid() || effectiveServerUrl.length > 0;

  const messagesRef = useRef(messages);
  const modeRef = useRef<ChatMode>('text');
  const statusRef = useRef<ChatStatus>('idle');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const speechGenerationRef = useRef(0);
  const listeningAllowedRef = useRef(false);
  const sendingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const startRecognitionRef = useRef<() => void>(() => {});
  const sendMessageRef = useRef<(text: string) => Promise<void>>(async () => {});
  const speakAnswerRef = useRef<(text: string) => void>(() => {});

  const commitMessages = useCallback((next: ChatMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const updateStatus = useCallback((next: ChatStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const updateMode = useCallback((next: ChatMode) => {
    modeRef.current = next;
    setMode(next);
  }, []);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const cancelSpeech = useCallback(() => {
    speechGenerationRef.current += 1;
    stopSpeechSynthesis();
  }, []);

  const stopRecognition = useCallback((abort: boolean) => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (!recognition) return;
    recognition.onstart = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      if (abort) recognition.abort();
      else recognition.stop();
    } catch {}
  }, []);

  const resumeListeningIfNeeded = useCallback(() => {
    if (modeRef.current !== 'voice' || !listeningAllowedRef.current) return;
    if (statusRef.current === 'speaking' || statusRef.current === 'thinking') return;
    clearRestartTimer();
    restartTimerRef.current = window.setTimeout(() => {
      restartTimerRef.current = null;
      startRecognitionRef.current();
    }, 350);
  }, [clearRestartTimer]);

  const startRecognition = useCallback(() => {
    clearRestartTimer();
    if (modeRef.current !== 'voice' || !listeningAllowedRef.current) return;
    if (statusRef.current === 'speaking' || statusRef.current === 'thinking') return;

    let recognition: SpeechRecognitionLike;
    try {
      recognition = createRecognition();
    } catch (err) {
      listeningAllowedRef.current = false;
      updateMode('text');
      updateStatus('idle');
      setError(err instanceof Error ? err.message : 'Reconhecimento de voz indisponível.');
      return;
    }

    recognitionRef.current = recognition;
    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      if (recognitionRef.current === recognition) updateStatus('listening');
    };

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let finalText = '';
      let interimText = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        let chunk = '';
        for (let part = 0; part < result.length; part += 1) {
          chunk += result[part].transcript;
        }
        if (result.isFinal) finalText += `${chunk} `;
        else interimText += chunk;
      }
      setInterim(interimText.trim());
      const finalTrimmed = finalText.trim();
      if (finalTrimmed) {
        void sendMessageRef.current(finalTrimmed);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      if (recognitionRef.current !== recognition) return;
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      const messagesByError: Record<string, string> = {
        'not-allowed':
          'Permissão de microfone negada. Ative o acesso ao microfone para usar a voz.',
        'service-not-allowed': 'Serviço de voz indisponível no dispositivo.',
        network: 'Sem rede para reconhecer a voz. Tente novamente.',
      };
      const message =
        messagesByError[event.error] || 'Não consegui ouvir você. Tente falar novamente.';
      setError(message);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        listeningAllowedRef.current = false;
        updateMode('text');
        updateStatus('idle');
      }
    };

    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
        if (statusRef.current === 'listening') updateStatus('idle');
      }
      resumeListeningIfNeeded();
    };

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      resumeListeningIfNeeded();
    }
  }, [clearRestartTimer, resumeListeningIfNeeded, updateMode, updateStatus]);

  const speakAnswer = useCallback(
    (text: string) => {
      if (modeRef.current !== 'voice' || !listeningAllowedRef.current) return;
      const generation = speechGenerationRef.current + 1;
      speechGenerationRef.current = generation;
      updateStatus('speaking');
      try {
        speakText(
          text,
          () => {
            if (generation !== speechGenerationRef.current) return;
            updateStatus('idle');
            resumeListeningIfNeeded();
          },
          () => {
            if (generation !== speechGenerationRef.current) return;
            updateStatus('idle');
            resumeListeningIfNeeded();
          }
        );
      } catch (err) {
        updateStatus('idle');
        setError(err instanceof Error ? err.message : 'Não consegui falar a resposta.');
        resumeListeningIfNeeded();
      }
    },
    [resumeListeningIfNeeded, updateStatus]
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean || sendingRef.current) return;
      sendingRef.current = true;
      cancelSpeech();
      clearRestartTimer();
      if (recognitionRef.current) stopRecognition(false);
      setInterim('');
      setError(null);

      const userMessage: ChatMessage = {
        id: createId(),
        role: 'user',
        text: clean,
      };
      const nextMessages = [...messagesRef.current, userMessage];
      commitMessages(nextMessages);
      setInput('');
      updateStatus('thinking');

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const history: GeminiChatMessage[] = nextMessages.map((message) => ({
          role: message.role,
          text: message.text,
        }));
        const answer = await askGemini(history, controller.signal);
        if (controller.signal.aborted) return;
        commitMessages([
          ...messagesRef.current,
          { id: createId(), role: 'assistant', text: answer },
        ]);
        updateStatus('idle');
        if (modeRef.current === 'voice' && listeningAllowedRef.current) {
          speakAnswerRef.current(answer);
        } else {
          resumeListeningIfNeeded();
        }
      } catch (err) {
        if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
          return;
        }
        const message =
          err instanceof Error ? err.message : 'A MAX AI não conseguiu responder agora.';
        commitMessages([
          ...messagesRef.current,
          { id: createId(), role: 'assistant', text: message },
        ]);
        setError(message);
        updateStatus('idle');
        resumeListeningIfNeeded();
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        sendingRef.current = false;
      }
    },
    [
      cancelSpeech,
      clearRestartTimer,
      commitMessages,
      resumeListeningIfNeeded,
      stopRecognition,
      updateStatus,
    ]
  );

  const interruptResponse = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    cancelSpeech();
    setInterim('');
    updateStatus('idle');
    resumeListeningIfNeeded();
  }, [cancelSpeech, resumeListeningIfNeeded, updateStatus]);

  const startVoiceMode = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    cancelSpeech();
    clearRestartTimer();
    setInterim('');
    setError(null);
    listeningAllowedRef.current = true;
    updateMode('voice');
    updateStatus('idle');
    startRecognition();
  }, [cancelSpeech, clearRestartTimer, startRecognition, updateMode, updateStatus]);

  const endVoiceMode = useCallback(() => {
    listeningAllowedRef.current = false;
    clearRestartTimer();
    stopRecognition(true);
    cancelSpeech();
    abortRef.current?.abort();
    abortRef.current = null;
    setInterim('');
    updateMode('text');
    updateStatus('idle');
    window.setTimeout(() => inputRef.current?.focus(), 60);
  }, [cancelSpeech, clearRestartTimer, stopRecognition, updateMode, updateStatus]);

  const toggleListening = useCallback(() => {
    if (statusRef.current === 'listening') {
      stopRecognition(false);
      updateStatus('idle');
      return;
    }
    listeningAllowedRef.current = true;
    startRecognition();
  }, [startRecognition, stopRecognition, updateStatus]);

  const clearConversation = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    cancelSpeech();
    stopRecognition(true);
    listeningAllowedRef.current = false;
    clearRestartTimer();
    commitMessages([createWelcomeMessage()]);
    setInterim('');
    setError(null);
    updateMode('text');
    updateStatus('idle');
  }, [cancelSpeech, clearRestartTimer, commitMessages, stopRecognition, updateMode, updateStatus]);

  const saveServerUrl = useCallback(() => {
    const normalized = setAiServerUrl(serverUrlInput);
    setServerUrlInput(normalized);
    setError(null);
    setServerUrlSaved(true);
    window.setTimeout(() => setServerUrlSaved(false), 2200);
  }, [serverUrlInput]);

  startRecognitionRef.current = startRecognition;
  sendMessageRef.current = sendMessage;
  speakAnswerRef.current = speakAnswer;

  useEffect(() => {
    saveMessages(messages);
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, interim, status]);

  useEffect(() => {
    return () => {
      listeningAllowedRef.current = false;
      clearRestartTimer();
      stopRecognition(true);
      cancelSpeech();
      abortRef.current?.abort();
    };
  }, [cancelSpeech, clearRestartTimer, stopRecognition]);

  const statusLabel =
    status === 'listening'
      ? 'Ouvindo você — fale naturalmente'
      : status === 'thinking'
        ? 'MAX AI respondendo...'
        : status === 'speaking'
          ? 'MAX AI falando...'
          : mode === 'voice'
            ? 'Modo voz ativo'
            : 'Pronto para conversar';

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage(input);
  };

  const handleCopyMessage = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setError(null);
    } catch {
      setError('Não foi possível copiar a mensagem.');
    }
  };

  const handleShareMessage = async (text: string) => {
    const nav = navigator as Navigator & {
      share?: (data: { title?: string; text?: string }) => Promise<void>;
    };
    try {
      if (nav.share) {
        await nav.share({ title: 'MAX AI', text });
      } else {
        await navigator.clipboard.writeText(text);
        setError('Compartilhamento indisponível neste dispositivo. Texto copiado.');
      }
    } catch {
      // usuário cancelou o compartilhamento
    }
  };

  const handleListenMessage = (id: string, text: string) => {
    if (listeningMessageId === id) {
      stopSpeechSynthesis();
      setListeningMessageId(null);
      return;
    }
    stopSpeechSynthesis();
    setListeningMessageId(id);
    try {
      speakText(
        text,
        () => setListeningMessageId(null),
        () => setListeningMessageId(null)
      );
    } catch {
      setListeningMessageId(null);
    }
  };

  const toggleFeedback = (id: string, value: 'up' | 'down') => {
    setFeedback((prev) =>
      prev[id] === value ? { ...prev, [id]: null } : { ...prev, [id]: value }
    );
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2 pt-0.5">
      <header className="flex items-center gap-2 px-0.5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar"
          className="min-w-[38px] min-h-[40px] flex items-center justify-center text-white hover:text-red-400 cursor-pointer"
        >
          <ArrowLeft className="w-7 h-7 stroke-[2.6]" />
        </button>
        <GoldCrownIcon className="w-8 h-8 shrink-0" />
        <div className="min-w-0 flex-1 leading-tight">
          <h1 className="font-display text-[21px] font-black tracking-wide text-white uppercase leading-none truncate">
            MAX AI 👑
          </h1>
          <p className="text-[11px] text-white/80 mt-0.5 truncate">
            Texto e voz em português brasileiro
          </p>
        </div>
        <button
          type="button"
          onClick={clearConversation}
          aria-label="Limpar conversa"
          className="min-w-[38px] min-h-[40px] flex items-center justify-center text-white/80 hover:text-red-400 cursor-pointer"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </header>

      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => {
            if (mode === 'voice') endVoiceMode();
          }}
          className={`rounded-xl px-2 py-2 flex items-center justify-center gap-1.5 text-[11.5px] font-bold cursor-pointer transition-colors ${
            mode === 'text'
              ? 'nexus-red-cta text-white'
              : 'nexus-card text-white/80'
          }`}
        >
          <Keyboard className="w-4 h-4" />
          Conversa por texto
        </button>
        <button
          type="button"
          onClick={() => {
            if (mode !== 'voice') startVoiceMode();
          }}
          className={`rounded-xl px-2 py-2 flex items-center justify-center gap-1.5 text-[11.5px] font-bold cursor-pointer transition-colors ${
            mode === 'voice'
              ? 'nexus-red-cta text-white'
              : 'nexus-card text-white/80'
          }`}
        >
          <Mic className="w-4 h-4" />
          Conversa por voz
        </button>
      </div>

      {!geminiReady && (
        <div className="rounded-lg border border-amber-500/60 bg-amber-950/50 px-2.5 py-1.5 text-[10.5px] text-amber-100">
          Configure o servidor MAX AI abaixo para conversar no APK. A chave da IA fica apenas no servidor.
        </div>
      )}

      {(isNativeAndroid() || !AI_SERVER_URL) && (
        <div className="rounded-lg border border-[#facc15]/50 bg-[#1b1604]/70 px-2.5 py-2 flex flex-col gap-1.5">
          <label htmlFor="max-ai-server-url" className="text-[10.5px] font-bold uppercase tracking-wide text-[#fde047]">
            Servidor MAX AI
          </label>
          <div className="flex gap-1.5">
            <input
              id="max-ai-server-url"
              value={serverUrlInput}
              onChange={(event) => setServerUrlInput(event.target.value)}
              placeholder="https://seu-servidor.exemplo"
              autoCapitalize="none"
              autoCorrect="off"
              className="flex-1 min-w-0 h-9 rounded-lg bg-[#120204]/95 border border-[#facc15]/50 px-2.5 text-[11.5px] text-white placeholder:text-white/40 outline-none focus:border-[#facc15]"
            />
            <button
              type="button"
              onClick={saveServerUrl}
              className="shrink-0 rounded-lg border border-[#facc15]/70 bg-[#2b2404] px-3 text-[11px] font-bold text-[#fde047] cursor-pointer"
            >
              Salvar
            </button>
          </div>
          <p className="text-[10px] leading-snug text-white/70">
            URL pública do servidor que expõe /api/ai. No APK, use HTTPS.
          </p>
          {serverUrlSaved && (
            <p className="text-[10px] font-bold text-[#22c55e]">URL salva neste dispositivo.</p>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col gap-2 pr-0.5">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[86%] rounded-2xl px-3 py-2 text-[12.5px] leading-relaxed ${
                message.role === 'user'
                  ? 'nexus-red-cta text-white'
                  : 'nexus-card text-white/95'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1 opacity-90">
                {message.role === 'assistant' ? (
                  <Sparkles className="w-3.5 h-3.5 text-[#facc15]" />
                ) : (
                  <User className="w-3.5 h-3.5 text-white" />
                )}
                <span className="text-[9.5px] font-bold uppercase tracking-wide">
                  {message.role === 'assistant' ? 'MAX AI' : 'Você'}
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words">{message.text}</p>
              {message.role === 'assistant' && (
                <div className="flex items-center gap-0.5 mt-1.5 pt-1.5 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => void handleCopyMessage(message.text)}
                    aria-label="Copiar resposta"
                    className="w-7 h-7 flex items-center justify-center rounded-md text-white/55 hover:text-white hover:bg-white/10 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleFeedback(message.id, 'up')}
                    aria-label="Curtir resposta"
                    className={`w-7 h-7 flex items-center justify-center rounded-md cursor-pointer ${
                      feedback[message.id] === 'up'
                        ? 'text-[#22c55e] bg-[#22c55e]/15'
                        : 'text-white/55 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleFeedback(message.id, 'down')}
                    aria-label="Não curtir resposta"
                    className={`w-7 h-7 flex items-center justify-center rounded-md cursor-pointer ${
                      feedback[message.id] === 'down'
                        ? 'text-[#ff4545] bg-[#ff4545]/15'
                        : 'text-white/55 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <ThumbsDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleShareMessage(message.text)}
                    aria-label="Compartilhar resposta"
                    className="w-7 h-7 flex items-center justify-center rounded-md text-white/55 hover:text-white hover:bg-white/10 cursor-pointer"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleListenMessage(message.id, message.text)}
                    aria-label={listeningMessageId === message.id ? 'Parar áudio' : 'Ouvir resposta'}
                    className={`w-7 h-7 flex items-center justify-center rounded-md cursor-pointer ${
                      listeningMessageId === message.id
                        ? 'text-[#facc15] bg-[#facc15]/15'
                        : 'text-white/55 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {listeningMessageId === message.id ? (
                      <Square className="w-3 h-3 fill-current" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {interim && (
          <div className="flex justify-end">
            <div className="max-w-[86%] rounded-2xl border border-dashed border-[#ff4545]/70 bg-[#2b0404]/70 px-3 py-2 text-[12.5px] text-white/70 italic">
              {interim}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-center justify-between gap-2 px-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`w-2 h-2 shrink-0 rounded-full ${
              status === 'idle' ? 'bg-zinc-500' : 'bg-[#22c55e] animate-pulse'
            }`}
          />
          {status === 'speaking' && (
            <Volume2 className="w-3.5 h-3.5 shrink-0 text-[#facc15]" />
          )}
          {status === 'thinking' && (
            <Bot className="w-3.5 h-3.5 shrink-0 text-[#ff4545]" />
          )}
          <span className="text-[11px] text-white/80 truncate">{statusLabel}</span>
        </div>
        {(status === 'speaking' || status === 'thinking') && (
          <button
            type="button"
            onClick={interruptResponse}
            className="shrink-0 rounded-full border border-[#ff4545]/70 bg-[#2b0404] px-2 py-1 flex items-center gap-1 text-[10.5px] font-bold text-white cursor-pointer"
          >
            <Square className="w-3 h-3 fill-current" />
            Parar resposta
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/70 bg-red-950/70 px-2.5 py-1.5 text-[10.5px] text-red-100 flex flex-col gap-1.5">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => {
              const lastUser = [...messagesRef.current].reverse().find((m) => m.role === 'user');
              if (lastUser) void sendMessage(lastUser.text);
            }}
            disabled={status === 'thinking'}
            className="self-start rounded-md border border-red-300/60 bg-red-900/60 px-2 py-1 text-[10.5px] font-bold text-white cursor-pointer disabled:opacity-40"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {mode === 'text' ? (
        <form onSubmit={handleSubmit} className="flex items-end gap-1.5 pb-0.5">
          <button
            type="button"
            onClick={startVoiceMode}
            aria-label="Ativar conversa por voz"
            className="nexus-card-interactive w-11 h-11 rounded-full flex items-center justify-center shrink-0 cursor-pointer"
          >
            <Mic className="w-5 h-5 text-[#ff4545]" />
          </button>
          <textarea
            ref={inputRef as unknown as React.RefObject<HTMLTextAreaElement>}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void sendMessage(input);
              }
            }}
            rows={1}
            placeholder="Digite sua mensagem... (Enter envia)"
            className="flex-1 min-w-0 min-h-[44px] max-h-[120px] rounded-2xl bg-[#120204]/95 border border-[#d91c1d]/80 px-3.5 py-2.5 text-[12.5px] text-white placeholder:text-white/45 outline-none focus:border-[#ff4545] resize-y"
          />
          <button
            type="submit"
            disabled={!input.trim() || status === 'thinking'}
            aria-label="Enviar mensagem"
            className="nexus-red-cta w-11 h-11 rounded-full flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-40"
          >
            <Send className="w-4 h-4 text-white" />
          </button>
        </form>
      ) : (
        <div className="nexus-card rounded-2xl px-3 py-2 flex flex-col gap-2">
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={toggleListening}
              className={`rounded-full px-3.5 py-2 flex items-center gap-1.5 text-[12px] font-bold cursor-pointer ${
                status === 'listening'
                  ? 'nexus-red-cta text-white'
                  : 'nexus-card-interactive text-white'
              }`}
            >
              {status === 'listening' ? (
                <Mic className="w-4 h-4" />
              ) : (
                <MicOff className="w-4 h-4" />
              )}
              {status === 'listening' ? 'Ouvindo você' : 'Falar agora'}
            </button>
            <button
              type="button"
              onClick={endVoiceMode}
              className="nexus-card-interactive rounded-full px-3 py-2 flex items-center gap-1.5 text-[12px] font-bold text-white cursor-pointer"
            >
              <Keyboard className="w-4 h-4" />
              Teclado
            </button>
          </div>
          <p className="text-center text-[10.5px] text-white/65">
            Fale naturalmente. A MAX AI responde em voz e você pode interromper quando quiser.
          </p>
        </div>
      )}
    </div>
  );
};
