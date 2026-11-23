# Relatório técnico — FIRE MAX / MAX PERFORMANCE + MAX AI

## Escopo
Revisão do ZIP `FIRE-MAX-CORRIGIDO.zip` recebido, com correções aplicadas nesta revisão. Nenhuma chave real foi incluída. A auditoria de arquivos não comprova que a chave Gemini está ativa nem que o backend hospedado está acessível.

## Correções aplicadas nesta revisão
1. `src/utils/auth.ts` agora usa `VITE_API_URL` e, como compatibilidade, `VITE_APP_URL`; se não houver URL no build, lê a URL salva em `max_ai_server_url_v1`.
2. `LoginScreen.tsx` agora permite informar e salvar o endereço HTTPS do backend antes de entrar, resolvendo o bloqueio circular em que era necessário fazer login para chegar à tela da MAX AI e configurar o servidor.
3. `vite.config.ts` define tanto `VITE_API_URL` quanto `VITE_APP_URL` sem expor credenciais.
4. CORS em `server.cjs` agora permite `GET`, `POST`, `OPTIONS` e o cabeçalho `Authorization`, necessário para chamadas autenticadas do APK.
5. A chamada Gemini envia a chave no cabeçalho `x-goog-api-key`, não na query string da URL.
6. Removido `gemini-2.5-flash` da lista de fallback; permanecem `gemini-3.8-flash` e `gemini-3-flash-preview`, com fallback apenas quando o modelo retorna HTTP 404.
7. Removido `temperature` da configuração de geração; aumentado `maxOutputTokens` de 300 para 1024 para reduzir respostas vazias por limite muito baixo.
8. Adicionado log técnico limitado de erros do provedor, sem registrar a chave.
9. Adicionado teste automatizado de preflight CORS para `GET` + `Authorization`.
10. Atualizados `.env.example`, README e este relatório.

## Arquivos de configuração encontrados no ZIP
- `.env.example`: presente, sem chave real.
- `.gitignore`: presente; ignora `.env`, diretórios de dados, builds e keystores.
- `.github/workflows/android.yml`: presente; executa lint, testes, build web e build APK debug.
- `android/app/src/main/AndroidManifest.xml`: presente; inclui permissões INTERNET e RECORD_AUDIO.
- `package-lock.json`: presente.
- `capacitor.config.json`: presente.

## Status técnico após a revisão
| Item | Status | Observação |
|---|---|---|
| Leitura de `GEMINI_API_KEY` no backend | APROVADO no código | Lê `process.env.GEMINI_API_KEY`; valor real não está no ZIP e não deve estar. |
| Chave protegida do frontend | APROVADO na inspeção estática | A chamada ocorre no backend; chave vai no header `x-goog-api-key`. Ainda é necessário conferir o histórico do Git e os secrets do deploy. |
| URL do backend no login Android | CORRIGIDO no código | Campo de URL na tela de login e suporte a `VITE_API_URL`/`VITE_APP_URL`. |
| CORS para login autenticado | CORRIGIDO no código | GET/POST/OPTIONS e Authorization liberados. Teste automatizado adicionado. |
| Modelo Gemini e disponibilidade | NÃO VERIFICADO em runtime | Modelo padrão mantido como `gemini-3.5-flash-lite`; disponibilidade/cota dependem da chave e do projeto Google. |
| Chave real e conexão Gemini | NÃO VERIFICADO | Requer `GEMINI_API_KEY` no servidor hospedado e teste HTTP real. |
| Chat ponta a ponta | NÃO VERIFICADO | Requer backend publicado e APK/web apontando para ele. |
| Gmail API / login Google | NÃO IMPLEMENTADO | Não há Gmail API nem OAuth Google nesta versão. Gmail não é necessário para o Gemini funcionar. |
| Voz no Android WebView | PARCIAL / DEPENDE DO DISPOSITIVO | O código usa Web Speech API; alguns WebViews Android não oferecem reconhecimento de fala. |
| Build APK | NÃO VERIFICADO | Workflow está presente, mas precisa ser executado no GitHub Actions. |

## Testes e limites
- `node --check server.cjs`: OK.
- `node --check scripts/test_backend.mjs`: OK.
- `node scripts/test_backend.mjs`: 14 cenários de backend + preflight CORS passaram usando um stub local temporário de `dotenv`, pois as dependências npm completas não estavam instaladas neste ambiente. Isso não substitui `npm ci`, TypeScript lint ou build.
- A compilação Vite/TypeScript e Gradle precisa ser validada pelo GitHub Actions.
- Nenhum teste de rede real à API Gemini foi realizado nesta revisão.

## Próximas etapas externas
1. Hospedar o backend e definir `GEMINI_API_KEY` apenas nas variáveis privadas do serviço.
2. Configurar a URL HTTPS do backend na tela de login do APK ou em `VITE_API_URL` no build.
3. Enviar o ZIP ao repositório e executar `.github/workflows/android.yml`.
4. Testar login, MAX AI e voz em um aparelho Android.
6. Implementar OAuth/Gmail separadamente somente se o aplicativo realmente precisar acessar a conta Gmail.

## Segurança
Nunca coloque `GEMINI_API_KEY`, senhas, tokens ou keystores no frontend, APK, `.env.example` ou repositório. Configure segredos apenas no ambiente privado do backend. Não use o webhook de teste em produção.
