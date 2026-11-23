# MAX PERFORMANCE + MAX AI 👑

Aplicativo **MAX PERFORMANCE + MAX AI** (React + Vite + TypeScript) empacotado com **Capacitor 7** para Android, com:
- **Tela cheia/imersiva** (edge-to-edge, ocultação de barras, suporte a recorte/cutout) e toggle no app.
- **Bolinha flutuante nativa** (overlay `SYSTEM_ALERT_WINDOW` + serviço em primeiro plano) com painel para controlar funções do próprio app sobre outros apps/jogos, arrastar, minimizar/fechar, desativar tudo e restaurar estado.
- **MAX AI** (chat por texto e voz em **pt-BR**) integrada ao backend seguro `POST /api/ai` usando **Gemini** com seleção/fallback automático de modelos.
- Otimizações/perfis, FPS boost, sensibilidade e demais telas/funcionalidades preservadas.

> **Segurança:** a chave do Gemini **nunca** fica no APK, no frontend, no HTML/JS ou no repositório. Ela é lida apenas no servidor via variável de ambiente.

## Requisitos

- Node.js 20+ (recomendado 22) e npm
- Para build Android local: **JDK 21** (compatível com AGP 8.7/Gradle 8.11) e **Android SDK** (platforms;android-35, build-tools;35.0.0)
- Para executar MAX AI: uma `GEMINI_API_KEY` válida configurada **no servidor**

## Configuração segura da MAX AI (servidor)

1. Copie o modelo de ambiente e configure **apenas no servidor/ambiente de execução** (não versione):
   ```bash
   cp .env.example .env
   ```
2. Edite `.env` e defina:
   ```env
   GEMINI_API_KEY=sua_chave_gemini_aqui
   PORT=3001
   APP_URL=http://localhost:3001
   # Opcional:
   # GEMINI_MODEL=gemini-3.5-flash-lite
   # GEMINI_API_ENDPOINT=https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent
   ```
3. O backend (`server.cjs`) carrega `.env` via `dotenv`, usa `GEMINI_MODEL` (padrão `gemini-3.5-flash-lite`) e faz **fallback automático** em caso de 404 do modelo (ex.: `gemini-2.5-flash`, `gemini-3.8-flash`, `gemini-3-flash-preview`) quando `GEMINI_API_ENDPOINT` não é forçado.
4. No APK, configure a URL pública do backend no campo **Endereço do servidor MAX** da tela de login (ex.: `https://seu-servidor.com`) e salve antes de entrar. Também pode definir `VITE_API_URL` no momento do build; `VITE_APP_URL` continua compatível com a tela MAX AI.

Variáveis suportadas (`.env.example`): `GEMINI_API_KEY`, `PORT`, `APP_URL`, `GEMINI_MODEL` (opcional), `GEMINI_API_ENDPOINT` (opcional), `VITE_API_URL` e `VITE_APP_URL` (URLs públicas não secretas usadas no build do frontend).

## Desenvolvimento local (web + MAX AI)

```bash
npm install
npm run dev      # Vite em http://localhost:3000 (proxy /api e /health -> :3001)
```

Em outro terminal, com `.env` configurado no servidor local:

```bash
node server.cjs  # backend MAX AI em http://localhost:3001 (POST /api/ai, GET /health)
```

Teste rápido do backend (sem expor chave): `GET /health` deve retornar `{"status":"ok","app":"MAX PERFORMANCE"}`.

## Build web e execução em produção

```bash
npm run build
npm start        # node server.cjs (serve dist/ e expõe /api/ai e /health)
```

Scripts disponíveis: `dev`, `build`, `preview`, `start`, `lint` (`tsc --noEmit`), `clean`.

## Gerar APK Android

### Opção A — GitHub Actions (recomendado)
1. Envie este projeto para o repositório GitHub **MAX-PERFORMANCE**.
2. Vá em **Actions → Build Android APK → Run workflow** (ou aguarde o push em branches configuradas).
3. Baixe o APK em:
   - **Artifacts:** `FIRE-MAX-debug-apk` (o workflow disponibiliza o APK por 14 dias)

O workflow instala Node 22, JDK 21 e Android SDK (API 35/build-tools 35.0.0), executa lint, build web, `cap sync android` e `./gradlew assembleDebug`.

### Opção B — Build local (máquina com JDK + Android SDK)

```bash
npm ci
npm run lint
npm run build
npx cap sync android
cd android
chmod +x gradlew
./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

Instalação: copie o APK para o celular, permita “instalar de fontes desconhecidas”, abra o app e conceda **Sobrepor outros apps** para usar a bolinha/painel sobre jogos.

### APK de lançamento (release)

- Build type `release` já está configurado (`minifyEnabled false`). Para **assinar** o release, crie `android/keystore.properties` (não versionado, já ignorado) com:
  ```properties
  storeFile=/caminho/para/sua-release.keystore
  storePassword=***
  keyAlias=***
  keyPassword=***
  ```
  e gere a keystore previamente. Em seguida:
  ```bash
  cd android && ./gradlew assembleRelease
  # APK: android/app/build/outputs/apk/release/app-release.apk (assinado se keystore.properties existir)
  ```
- Sem `keystore.properties`, `assembleRelease` gera artefato não assinado para assinatura posterior; para instalação direta prefira o **APK debug**.

## Permissões e recursos Android

Declarados em `android/app/src/main/AndroidManifest.xml`:
- `INTERNET`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` (MAX AI/voz)
- `SYSTEM_ALERT_WINDOW`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_SPECIAL_USE` (bolinha/painel overlay)
- `POST_NOTIFICATIONS` (Android 13+), `VIBRATE`

Serviço: `OverlayService` (foreground, tipo `specialUse`), overlay nativo arrastável com painel e sincronização com o app. Tela cheia/imersiva aplicada em `MainActivity` com suporte a cutout.

## Estrutura relevante

- `src/` — UI React (telas, MAX AI, voz pt-BR, overlay in-app, configurações)
- `server.cjs` — backend seguro MAX AI (`/api/ai`, `/health`)
- `android/` — projeto Android/Capacitor (MainActivity, NexusOverlayPlugin, OverlayService, layouts, recursos)
- `capacitor.config.json` — appId `com.maxperformance.nexus`, appName `MAX PERFORMANCE`, webDir `dist`
- `.github/workflows/android.yml` — CI de compilação e disponibilização do APK debug como artifact

## Configuração segura da chave no backend (para o APK rodar a MAX AI)

A chave **não** vai para o repositório nem para o APK. Para o backend em produção (ex.: no servidor que o app acessa), configure-a como **secret** do GitHub:
1. No repositório: **Settings → Secrets and variables → Actions → New repository secret**.
2. Configure `GEMINI_API_KEY` como variável secreta no provedor onde o backend `server.cjs` será hospedado. Um GitHub Actions secret, sozinho, não disponibiliza a chave para um servidor em execução.
3. Se o backend for implantado por workflow, crie um workflow de deploy separado e injete o secret somente nesse processo, sem gravá-lo em arquivos versionados.


## Enviar o projeto ao GitHub (Termux)

```bash
cd $HOME/MAX-AI-PROJETO-PRINCIPAL   # pasta com o conteúdo do projeto
git init -b main
git add -A
git commit -m "MAX PERFORMANCE + MAX AI"
git remote add origin https://github.com/Wagner1234567890123/MAX-AI-PROJETO-PRINCIPAL.git
git push -u origin main
```

Se o repositório já existir localmente, apenas `git pull origin main` antes de `git push`. Nunca force push (`-f`) para não sobrescrever o histórico. O repositório antigo **NEXUS-BOOST** não deve ser alterado.

## Observações

- O overlay controla apenas funções do próprio app; não modifica/injeta/automatiza outros aplicativos/jogos.
- Testes de voz (microfone/reconhecimento/TTS pt-BR), overlay sobre jogos e comportamento visual em dispositivo real devem ser validados em aparelhos Android (ex.: Android 14).
- `npm run lint`, `npm run build`, `node --check server.cjs` e `npx cap sync android` devem passar antes de gerar APK.


## Integrações Google não incluídas
A integração Gemini é independente do Gmail. Este projeto não inclui Gmail API, OAuth do Gmail ou login Google funcional nesta versão. O botão "Entrar com Google" permanece informativo até que um fluxo OAuth/Firebase seja configurado separadamente.
