# Push notifications (Expo + FCM) — configuração

O código do app e da API já está pronto (ver "Push (Expo)" em [ARCHITECTURE.md](ARCHITECTURE.md)). Falta a configuração de contas, que só o dono pode fazer. Nada abaixo vai para o git.

## 1. Projeto EAS (conta Expo)

```bash
cd mobile
npx eas-cli@latest login
npx eas-cli@latest init        # cria o projeto e grava extra.eas.projectId no app.json
```

O `projectId` **não é segredo**; pode commitar o `app.json`. Alternativa sem alterar arquivo: `export EAS_PROJECT_ID=<id>` ao gerar o build.

## 2. Firebase (Android)

1. https://console.firebase.google.com → criar projeto (Analytics pode ficar desligado).
2. Adicionar app Android com o pacote `br.com.infinitsolucoesweb.comercial`.
3. Baixar o `google-services.json` e guardar **fora do git**, por exemplo `mobile/secrets/google-services.json` (a pasta `secrets/` e o arquivo `google-services.json` já estão no `.gitignore`).
4. Ao gerar o build: `export GOOGLE_SERVICES_JSON=./secrets/google-services.json` (o `app.config.ts` aponta o Expo para ele).

## 3. Credencial FCM V1 (para o Expo enviar)

1. Firebase → Configurações do projeto → Contas de serviço → **Gerar nova chave privada** (JSON). Guarde fora do git.
2. `npx eas-cli@latest credentials` → Android → Google Service Account Key (FCM V1) → enviar esse JSON.

A chave fica na Expo, não no app nem na API.

## 4. Ligar na API

Variáveis de ambiente do serviço da API (nunca em arquivo versionado):

```bash
Push__Enabled=true
# opcional, só se a conta Expo exigir "enhanced security":
# Push__ExpoAccessToken=<token de acesso Expo>
```

A tabela `mobile_push_tokens` vem da migration 0003 (`migrate`). A API consulta a cada `Push__PollSeconds` (padrão 15 s) e envia as notificações novas do usuário.

## 5. Novo build e teste

O push exige aparelho físico (o emulador sem Play Services não registra) e um build novo, porque o `google-services.json` é aplicado no nativo:

```bash
cd mobile
export GOOGLE_SERVICES_JSON=./secrets/google-services.json
npx expo prebuild --clean
# ...build do APK como no README
```

1. Instale, conecte por QR e aceite a permissão de notificações.
2. No ComercialWeb, gere uma notificação para o usuário (qualquer evento que crie notificação no sino).
3. Em até ~15 s o aparelho recebe; tocar na notificação abre a tela de notificações.

Sem `projectId`, sem permissão, sem Play Services ou sem rede o app apenas não registra o push (nunca bloqueia o login).
