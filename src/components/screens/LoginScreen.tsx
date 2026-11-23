import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { GoldCrownIcon } from '../Icons';
import { apiLogin, apiRegister, apiGoogleLogin, apiPhoneLogin, AuthUser, getApiBaseUrl, setApiBaseUrl } from '../../utils/auth';

interface LoginScreenProps {
  onAuthed: (token: string, user: AuthUser) => void;
}

const SUPPORT_EMAIL = 'wagneramorim063@gmail.com';

export const LoginScreen: React.FC<LoginScreenProps> = ({ onAuthed }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [serverUrl, setServerUrl] = useState(() => getApiBaseUrl());
  const [serverUrlSaved, setServerUrlSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [phoneStep, setPhoneStep] = useState<'phone' | 'code' | null>(null);
  const phoneListeners = useRef<Array<{ remove: () => Promise<void> }>>([]);
  const phoneListenersReady = useRef(false);
  const phoneLoginBusy = useRef(false);

  useEffect(() => {
    return () => {
      phoneListeners.current.forEach((listener) => void listener.remove());
    };
  }, []);

  const finishPhoneLogin = async () => {
    if (phoneLoginBusy.current) return;
    phoneLoginBusy.current = true;
    setLoading(true);
    try {
      const result = await FirebaseAuthentication.getIdToken();
      if (!result.token) throw new Error('Token do telefone não recebido.');
      const res = await apiPhoneLogin(result.token);
      onAuthed(res.token, res.user as AuthUser);
    } catch (err) {
      phoneLoginBusy.current = false;
      setError(err instanceof Error ? err.message : 'Falha no login por telefone.');
    } finally {
      setLoading(false);
    }
  };

  const preparePhoneListeners = async () => {
    if (phoneListenersReady.current) return;
    const listeners: Array<{ remove: () => Promise<void> }> = [];
    try {
      listeners.push(await FirebaseAuthentication.addListener('phoneCodeSent', (event) => {
        setVerificationId(event.verificationId);
        setPhoneStep('code');
        setInfo('Código SMS enviado. Confira suas mensagens.');
        setLoading(false);
      }));
      listeners.push(await FirebaseAuthentication.addListener('phoneVerificationFailed', (event) => {
        setError(event.message || 'Falha na verificação do telefone.');
        setLoading(false);
      }));
      listeners.push(await FirebaseAuthentication.addListener('phoneVerificationCompleted', () => {
        void finishPhoneLogin();
      }));
      phoneListeners.current = listeners;
      phoneListenersReady.current = true;
    } catch (err) {
      await Promise.all(listeners.map((listener) => listener.remove()));
      throw err;
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (serverUrl.trim()) {
      const normalized = setApiBaseUrl(serverUrl);
      if (!normalized) {
        setError('Informe uma URL válida do servidor, começando com https:// ou http://.');
        return;
      }
      setServerUrl(normalized);
    }
    if (Capacitor.isNativePlatform() && !getApiBaseUrl()) {
      setError('Configure o endereço HTTPS do servidor antes de entrar no aplicativo.');
      return;
    }
    if (!email.trim() || password.length < 6) {
      setError('Informe um e-mail válido e uma senha com ao menos 6 caracteres.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'register') {
        const res = await apiRegister(email.trim(), password, name.trim());
        onAuthed(res.token, res.user as AuthUser);
      } else {
        const res = await apiLogin(email.trim(), password);
        onAuthed(res.token, res.user as AuthUser);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na autenticação.');
    } finally {
      setLoading(false);
    }
  };

  const handleHelp = () => {
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Suporte MAX AI")}`;
  };

  const handleGoogle = async () => {
    setError(null);
    setInfo(null);
    if (!Capacitor.isNativePlatform()) { setError("Use o aplicativo Android para entrar com Google."); return; }
    if (serverUrl.trim()) {
      const normalized = setApiBaseUrl(serverUrl);
      if (!normalized) { setError("Informe uma URL válida do servidor."); return; }
      setServerUrl(normalized);
    }
    if (!getApiBaseUrl()) { setError("Configure o endereço HTTPS do servidor antes de entrar."); return; }
    setLoading(true);
    try {
      await FirebaseAuthentication.signInWithGoogle();
      const result = await FirebaseAuthentication.getIdToken();
      if (!result.token) throw new Error("Não foi possível obter o token do Google.");
      const res = await apiGoogleLogin(result.token);
      onAuthed(res.token, res.user as AuthUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login Google.");
    } finally { setLoading(false); }
  };

  const handlePhone = () => {
    setError(null);
    setInfo('Informe seu número com DDD para receber o código.');
    setPhoneStep('phone');
    setVerificationCode('');
    setVerificationId('');
  };

  const sendPhoneCode = async () => {
    setError(null);
    setInfo(null);

    if (!Capacitor.isNativePlatform()) {
      setError('O envio de SMS está disponível no aplicativo Android.');
      return;
    }

    if (serverUrl.trim()) {
      const normalized = setApiBaseUrl(serverUrl);
      if (!normalized) {
        setError('Informe uma URL válida do servidor.');
        return;
      }
      setServerUrl(normalized);
    }
    if (!getApiBaseUrl()) {
      setError('Configure o endereço HTTPS do servidor antes de entrar.');
      return;
    }

    const digits = phoneNumber.replace(/\D/g, '');
    const nationalDigits = digits.startsWith('55') ? digits.slice(2) : digits;
    if (!/^\d{10,11}$/.test(nationalDigits)) {
      setError('Informe DDD e telefone com 10 ou 11 dígitos.');
      return;
    }

    setLoading(true);
    try {
      await preparePhoneListeners();
      await FirebaseAuthentication.signInWithPhoneNumber({
        phoneNumber: '+55' + nationalDigits,
        timeout: 60,
      });
      setInfo('Solicitação enviada. Aguardando o SMS...');
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Não foi possível enviar o SMS.');
    }
  };

  const confirmPhoneCode = async () => {
    setError(null);
    setInfo(null);
    if (!verificationId) {
      setError('Solicite primeiro o código SMS.');
      return;
    }
    if (!/^\d{6}$/.test(verificationCode.trim())) {
      setError('Digite o código de seis dígitos.');
      return;
    }

    setLoading(true);
    try {
      await FirebaseAuthentication.confirmVerificationCode({
        verificationId,
        verificationCode: verificationCode.trim(),
      });
      await finishPhoneLogin();
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Código inválido ou expirado.');
    }
  };;

  return (
    <div className="w-full max-w-sm mx-auto flex flex-col items-center px-5 py-8">
      {/* Perfil / logo */}
      <div className="w-20 h-20 rounded-full border-2 border-red-600 bg-gradient-to-b from-red-900 to-black shadow-[0_0_25px_rgba(220,38,38,0.5)] flex items-center justify-center mb-4">
        <GoldCrownIcon className="w-10 h-10 text-[#facc15]" />
      </div>
      <h1 className="font-display text-2xl font-black tracking-wide text-white mb-1">
        MAX <span className="text-[#facc15]">AI</span> 👑
      </h1>
      <p className="text-white/60 text-xs mb-6 text-center">
        {mode === 'login' ? 'Entre para continuar' : 'Crie sua conta gratuita'}
      </p>

      <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3">
        {mode === 'register' && (
          <input
            type="text"
            placeholder="Seu nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl bg-black/60 border border-red-900/60 px-4 py-3 text-sm text-white placeholder-white/40 outline-none focus:border-red-500"
          />
        )}
        <input
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl bg-black/60 border border-red-900/60 px-4 py-3 text-sm text-white placeholder-white/40 outline-none focus:border-red-500"
        />
        <input
          type="password"
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl bg-black/60 border border-red-900/60 px-4 py-3 text-sm text-white placeholder-white/40 outline-none focus:border-red-500"
        />

        <div className="w-full flex flex-col gap-1.5">
          <label className="text-[11px] text-white/60" htmlFor="max-server-url">
            Endereço do servidor MAX (necessário no APK)
          </label>
          <input
            id="max-server-url"
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="https://seu-servidor.com"
            value={serverUrl}
            onChange={(e) => {
              setServerUrl(e.target.value);
              setServerUrlSaved(false);
            }}
            className="w-full rounded-xl bg-black/60 border border-red-900/60 px-4 py-3 text-xs text-white placeholder-white/40 outline-none focus:border-red-500"
          />
          <button
            type="button"
            onClick={() => {
              const normalized = setApiBaseUrl(serverUrl);
              if (serverUrl.trim() && !normalized) {
                setError('URL inválida. Use um endereço começando com https:// ou http://.');
                setServerUrlSaved(false);
                return;
              }
              setServerUrl(normalized);
              setServerUrlSaved(true);
              setError(null);
              setInfo(normalized ? 'Endereço do servidor salvo neste aparelho.' : 'Endereço personalizado removido.');
            }}
            className="self-end text-[11px] font-semibold text-[#facc15] hover:underline"
          >
            Salvar endereço
          </button>
          {serverUrlSaved && (
            <p className="text-emerald-400 text-[11px]">Endereço salvo.</p>
          )}
        </div>

        {error && (
          <p className="text-red-400 text-xs text-center">{error}</p>
        )}
        {info && (
          <p className="text-white/60 text-xs text-center">{info}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-gradient-to-r from-red-700 to-red-600 text-white font-bold text-sm py-3 shadow-[0_0_18px_rgba(220,38,38,0.5)] hover:brightness-110 disabled:opacity-60 transition"
        >
          {loading ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
        </button>
      </form>

      <div className="w-full flex items-center gap-3 my-5">
        <div className="h-px flex-1 bg-white/10" />
        <span className="text-white/40 text-xs">ou</span>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      <div className="w-full flex flex-col gap-2.5">
        <button
          type="button"
          onClick={handleGoogle}
          className="w-full rounded-xl bg-white/5 border border-white/15 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10 transition flex items-center justify-center gap-2"
        >
          <span className="text-base">G</span> Entrar com Google
        </button>
        <button
          type="button"
          onClick={handlePhone}
          className="w-full rounded-xl bg-white/5 border border-white/15 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10 transition flex items-center justify-center gap-2"
        >
          <span className="text-base">📱</span> Entrar com telefone
        </button>
      </div>

      {phoneStep && (
        <div className="w-full flex flex-col gap-2.5 mt-4 rounded-xl border border-red-900/60 bg-black/40 p-4">
          {phoneStep === 'phone' ? (
            <>
              <label className="text-xs text-white/70">Telefone com DDD</label>
              <input
                type="tel"
                inputMode="tel"
                placeholder="(11) 99999-9999"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full rounded-xl bg-black/60 border border-red-900/60 px-4 py-3 text-sm text-white placeholder-white/40 outline-none focus:border-red-500"
              />
              <button type="button" onClick={sendPhoneCode} disabled={loading}
                className="w-full rounded-xl bg-red-700 text-white font-bold text-sm py-3 disabled:opacity-60">
                {loading ? 'Enviando...' : 'Enviar código SMS'}
              </button>
            </>
          ) : (
            <>
              <label className="text-xs text-white/70">Código de seis dígitos</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full rounded-xl bg-black/60 border border-red-900/60 px-4 py-3 text-sm text-white text-center tracking-widest"
              />
              <button type="button" onClick={confirmPhoneCode} disabled={loading}
                className="w-full rounded-xl bg-red-700 text-white font-bold text-sm py-3 disabled:opacity-60">
                {loading ? 'Verificando...' : 'Confirmar código'}
              </button>
              <button type="button" onClick={() => {
                setPhoneStep('phone');
                setVerificationId('');
                setVerificationCode('');
                setError(null);
                setInfo('Confira o telefone antes de solicitar outro código.');
              }} className="text-xs text-[#facc15] py-2">
                Corrigir telefone
              </button>
            </>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setMode((m) => (m === 'login' ? 'register' : 'login'));
          setError(null);
          setInfo(null);
        }}
        className="mt-5 text-[#facc15] text-xs font-bold hover:underline"
      >
        {mode === 'login' ? 'Criar conta' : 'Já tenho conta — entrar'}
      </button>

      <button
        type="button"
        onClick={handleHelp}
        className="mt-6 text-white/50 text-xs hover:text-white transition"
      >
        Ajuda & Suporte
      </button>
    </div>
  );
};
