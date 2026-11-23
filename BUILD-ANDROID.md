# MAX PERFORMANCE + MAX AI — Build Android (APK)

Projeto web (Vite + React + TypeScript) empacotado com **Capacitor 7** e overlay nativo
(`SYSTEM_ALERT_WINDOW` + serviço em primeiro plano) para a bolinha/painel flutuante.

## APK via GitHub Actions

| Item | Detalhe |
| --- | --- |
| Workflow | `.github/workflows/android-apk.yml` ("Build Android APK") |
| Gatilho | `workflow_dispatch` (manual) e push em branches/paths configurados |
| Artifact | `MAX-PERFORMANCE-debug-apk` → `MAX-PERFORMANCE-MAX-AI-debug.apk` |
| Release | tag `apk-latest` (link direto no repositório) |
| Saída no build | `android/app/build/outputs/apk/debug/app-debug.apk` |

### Gerar
1. No repositório **MAX-PERFORMANCE**, abra **Actions → Build Android APK → Run workflow**.
2. Aguarde a conclusão (~5–10 min).
3. Baixe pelo **Release `apk-latest`** ou pelo artifact do run.

## Build local

Requisitos: Node 20+/22, **JDK 21**, Android SDK (API 35, build-tools 35.0.0).

```bash
npm ci
npm run lint
npm run build
npx cap sync android
cd android
chmod +x gradlew
./gradlew assembleDebug
```

APK gerado: `android/app/build/outputs/apk/debug/app-debug.apk`

## Release (assinatura opcional)

`./gradlew assembleRelease` está pronto no Gradle. Para gerar release assinado:
1. Crie uma keystore (não versione).
2. Crie `android/keystore.properties` (ignorado pelo git):
   ```properties
   storeFile=/caminho/release.keystore
   storePassword=...
   keyAlias=...
   keyPassword=...
   ```
3. Rode `cd android && ./gradlew assembleRelease` → `app/build/outputs/apk/release/app-release.apk`.

Sem keystore o release não sai assinado; para instalar diretamente use o APK debug.

## Instalação no dispositivo

1. Transfira `MAX-PERFORMANCE-MAX-AI-debug.apk` para o Android.
2. Permita instalação de fontes desconhecidas.
3. Abra o app e conceda **Sobrepor outros apps** (e microfone/notificação quando solicitado) para overlay e voz.
4. Configure a URL do servidor MAX AI no app se necessário; a `GEMINI_API_KEY` deve existir **apenas no servidor** (`.env`).

## Compatibilidade/configuração conferida

- Capacitor Android 7, AGP 8.7.2, Gradle 8.11.1, compile/target SDK 35, min SDK 23.
- Permissões: INTERNET, RECORD_AUDIO, MODIFY_AUDIO_SETTINGS, SYSTEM_ALERT_WINDOW, FOREGROUND_SERVICE, FOREGROUND_SERVICE_SPECIAL_USE, POST_NOTIFICATIONS, VIBRATE.
- Overlay: `OverlayService` (foreground specialUse), `NexusOverlayPlugin`, layout `overlay_bubble.xml`.
- Tela cheia/imersiva: `MainActivity` (edge-to-edge, hide system bars, cutout).
- MAX AI: backend `server.cjs` (`POST /api/ai`, Gemini, fallback de modelos), voz pt-BR no app.
