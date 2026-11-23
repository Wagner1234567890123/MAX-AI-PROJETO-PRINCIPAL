import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Ponte com o plugin nativo NexusOverlay (Android).
 * No APK ele liga a bolinha do sistema (SYSTEM_ALERT_WINDOW), que fica
 * visível por cima do Free Fire. No navegador nada é chamado.
 */
interface NexusOverlayPlugin {
  canDrawOverlays(): Promise<{ granted: boolean; running: boolean }>;
  requestPermission(): Promise<{ granted: boolean }>;
  startOverlay(): Promise<{ running: boolean }>;
  stopOverlay(): Promise<{ running: boolean }>;
  isOverlayRunning(): Promise<{ running: boolean; granted: boolean }>;
  syncState?(state: {
    fps?: number;
    slowWalk?: boolean;
    economy?: boolean;
    boostActive?: boolean;
    gpuHighPerf?: boolean;
    performanceFlags?: {
      maxPerformance?: boolean;
      reduceStutter?: boolean;
      stabilizeFps?: boolean;
      antiLag?: boolean;
      memoryOpt?: boolean;
    };
  }): Promise<{ ok: boolean }>;
  getOverlayState?(): Promise<{
    fps: number;
    slowWalk: boolean;
    economy: boolean;
    boostActive: boolean;
    gpuHighPerf?: boolean;
    performanceFlags?: {
      maxPerformance: boolean;
      reduceStutter: boolean;
      stabilizeFps: boolean;
      antiLag: boolean;
      memoryOpt: boolean;
    };
  }>;
  setImmersive?(state: { enabled: boolean }): Promise<{ ok: boolean }>;
}

const NexusOverlay = registerPlugin<NexusOverlayPlugin>('NexusOverlay');

export interface GameOverlayState {
  native: boolean;
  granted: boolean;
  running: boolean;
}

export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function getGameOverlayState(): Promise<GameOverlayState> {
  if (!isNativeAndroid()) {
    return { native: false, granted: false, running: false };
  }
  try {
    const res = await NexusOverlay.isOverlayRunning();
    return { native: true, granted: !!res.granted, running: !!res.running };
  } catch {
    return { native: true, granted: false, running: false };
  }
}

export async function enableGameOverlay(): Promise<{ ok: boolean; message: string }> {
  if (!isNativeAndroid()) {
    return {
      ok: false,
      message: 'A bolinha sobre o jogo funciona no APK Android. Instale o APK para ativar.',
    };
  }
  try {
    const permission = await NexusOverlay.requestPermission();
    if (!permission.granted) {
      return {
        ok: false,
        message: 'Autorize "Exibir sobre outros apps" nas configurações do Android e toque novamente.',
      };
    }
    await NexusOverlay.startOverlay();
    return { ok: true, message: 'Bolinha ativa! Ela continua visível durante o Free Fire.' };
  } catch {
    return { ok: false, message: 'Não foi possível iniciar a bolinha. Verifique a permissão de sobreposição.' };
  }
}

export async function disableGameOverlay(): Promise<{ ok: boolean; message: string }> {
  if (!isNativeAndroid()) {
    return { ok: true, message: 'Bolinha do jogo desativada.' };
  }
  try {
    await NexusOverlay.stopOverlay();
    return { ok: true, message: 'Bolinha do jogo desativada.' };
  } catch {
    return { ok: false, message: 'Não foi possível desativar a bolinha do jogo.' };
  }
}

export interface NativeOverlayPrefs {
  fps: number;
  slowWalk: boolean;
  economy: boolean;
  boostActive: boolean;
  gpuHighPerf?: boolean;
  performanceFlags?: {
    maxPerformance: boolean;
    reduceStutter: boolean;
    stabilizeFps: boolean;
    antiLag: boolean;
    memoryOpt: boolean;
  };
}

export async function syncNativeOverlayState(
  state: Partial<NativeOverlayPrefs>
): Promise<void> {
  if (!isNativeAndroid() || !NexusOverlay.syncState) return;
  try {
    await NexusOverlay.syncState(state);
  } catch {}
}

export async function getNativeOverlayState(): Promise<NativeOverlayPrefs | null> {
  if (!isNativeAndroid() || !NexusOverlay.getOverlayState) return null;
  try {
    const res = await NexusOverlay.getOverlayState();
    return {
      fps: typeof res.fps === 'number' ? res.fps : 90,
      slowWalk: !!res.slowWalk,
      economy: !!res.economy,
      boostActive: !!res.boostActive,
      gpuHighPerf: typeof res.gpuHighPerf === 'boolean' ? res.gpuHighPerf : undefined,
      performanceFlags: res.performanceFlags,
    };
  } catch {
    return null;
  }
}


export async function setNativeImmersiveMode(enabled: boolean): Promise<void> {
  if (!isNativeAndroid() || !NexusOverlay.setImmersive) return;
  try {
    await NexusOverlay.setImmersive({ enabled });
  } catch {}
}
