# Instruções — MAX PERFORMANCE + MAX AI

## 1) Criar o repositório GitHub "MAX-PERFORMANCE" e enviar o projeto
> Requer autenticação GitHub (token/SSH ou `gh auth login`) no seu ambiente.

### Com GitHub CLI (recomendado)
```bash
# dentro da pasta do projeto
git init
git add .
git commit -m "Inicial: MAX PERFORMANCE + MAX AI"
gh repo create MAX-PERFORMANCE --public --source=. --remote=origin --push
# (use --private se preferir)
```

### Com git + repositório criado no site
1. Crie um repositório vazio chamado `MAX-PERFORMANCE` no GitHub (sem README/.gitignore iniciais).
2. No projeto:
```bash
git init
git add .
git commit -m "Inicial: MAX PERFORMANCE + MAX AI"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/MAX-PERFORMANCE.git
git push -u origin main
```

## 2) Configurar variáveis de ambiente do servidor (MAX AI / Gemini)
1. No servidor (nunca no app/APK/GitHub):
   ```bash
   cp .env.example .env
   ```
2. Defina em `.env`:
   - `GEMINI_API_KEY=...` (obrigatória)
   - `PORT=3001` (ou a porta do servidor)
   - `APP_URL=http://seu-host:porta` (opcional, conforme deploy)
   - Opcional: `GEMINI_MODEL`, `GEMINI_API_ENDPOINT`
3. Inicie: `npm ci && npm run build && npm start` (ou `node server.cjs`).
4. Verifique: `GET /health` → `{"status":"ok","app":"MAX PERFORMANCE"}`.
5. No APK/app, configure a URL do servidor MAX AI se ele não for o mesmo host do frontend.

**Importante:** não coloque a chave no frontend, no APK, em arquivos versionados ou em relatórios.

## 3) Gerar o APK novamente

### Pelo GitHub Actions
- Actions → **Build Android APK** → **Run workflow** → baixe em Release `apk-latest` (`MAX-PERFORMANCE-MAX-AI-debug.apk`) ou no artifact.

### Localmente (JDK 21 + Android SDK 35)
```bash
npm ci
npm run lint
npm run build
npx cap sync android
cd android
chmod +x gradlew
./gradlew assembleDebug
# saída: android/app/build/outputs/apk/debug/app-debug.apk
```

### Release assinado (opcional)
- Crie `android/keystore.properties` (não versionar) com `storeFile`, `storePassword`, `keyAlias`, `keyPassword` e rode `./gradlew assembleRelease`.

## 4) Instalar e testar no Android
- Instale o APK (permitir fontes desconhecidas).
- Conceda **Sobrepor outros apps**, **Microfone** e **Notificações** quando solicitado.
- Ative a bolinha/painel e teste sobre o jogo; valide tela cheia, toggles, voz pt-BR e respostas da MAX AI com o servidor configurado.

## 5) Checklist rápido
- [ ] `.env` **não** está no repositório/ZIP
- [ ] `GEMINI_API_KEY` configurada só no servidor
- [ ] `npm run lint` e `npm run build` OK
- [ ] `npx cap sync android` OK
- [ ] APK gerado (Actions/local) e instalado
