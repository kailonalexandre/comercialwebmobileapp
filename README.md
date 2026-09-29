# ComercialWeb Mobile

Aplicativo mobile (Android/iOS) do ComercialWeb. Expo SDK 57 + React Native + TypeScript estrito.

Arquitetura, autenticação e threat model: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Requisitos (Linux)

- Node 24 LTS (`.nvmrc`)
- JDK 17+ (testado com 21)
- Android SDK: `ANDROID_HOME=$HOME/Android/Sdk` com `platform-tools` e um emulador (ou aparelho com depuração USB)

```bash
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator
```

## Ambientes

O ambiente é fixado no build por `EXPO_PUBLIC_APP_ENV` (`local` ou `vps`); o usuário final não escolhe. Sem valor: `expo start` usa `local`, qualquer outro build usa `vps` (o padrão seguro). Toda a regra vive em `mobile/src/infrastructure/config.ts` (`AppEnvironment`).

| | local | vps |
|---|---|---|
| HTTP | sim, só para rede privada (10.x, 172.16-31.x, 192.168.x, localhost, 10.0.2.2), porta opcional | não; só HTTPS |
| Host do QR | qualquer host de rede privada (HTTPS: qualquer) | só `EXPO_PUBLIC_ALLOWED_SERVER_HOSTS` |
| Logs de rede | sim (método, caminho, status; nunca token nem query) | não |
| Colar link do QR | sim | não |
| Selo | "LOCAL" na tela Conectar e no início | nenhum |

O app fala só com a API .NET (`EXPO_PUBLIC_API_URL`). O `server` do QR é **validado** pelas regras do ambiente, mas nunca vira endereço de chamada (evita SSRF): quem fala com o ComercialWeb é a API.

## Rodar local apontando para `http://<IP-da-máquina>:8080`

```bash
cd mobile
npm ci
cp .env.example .env.local      # ajuste EXPO_PUBLIC_API_URL=http://<IP-da-máquina>:8080
npm run android                 # gera android/, compila e instala no emulador/aparelho
```

- IP da máquina na LAN: `ip -4 addr` (Linux). Emulador Android: `http://10.0.2.2:8080`.
- A API precisa escutar em `0.0.0.0` (ex.: `ASPNETCORE_URLS=http://0.0.0.0:8080`) e o firewall liberar a porta 8080.
- Sem câmera: no ComercialWeb gere o QR, copie o link `comercialweb://pair?code=…&server=…` e cole na tela Conectar (só no flavor local).
- Sem `EXPO_PUBLIC_API_URL`, o modo dev usa sessão fictícia.
- Trocou de ambiente (local ↔ vps)? Regenere o nativo: `npx expo prebuild --clean`. O cleartext do Android e o `NSAllowsLocalNetworking` do iOS só existem no flavor local (`mobile/app.config.ts`).

## Build de produção para a VPS

Nunca use `.env.local` aqui: defina as variáveis no comando (elas têm precedência sobre arquivos `.env`).

```bash
cd mobile
export EXPO_PUBLIC_APP_ENV=vps
export EXPO_PUBLIC_API_URL=https://api.meudominio.com.br
export EXPO_PUBLIC_ALLOWED_SERVER_HOSTS='app.meudominio.com.br,*.meudominio.com.br'
npx expo prebuild --clean
npx expo run:android --variant release      # APK release (assinatura: keystore própria antes de publicar)
```

Na nuvem: `npx eas-cli@latest build --platform android|ios` com as mesmas três variáveis em `env` do perfil de produção do `eas.json`. `EXPO_PUBLIC_API_URL` sem HTTPS faz o app falhar ao abrir (de propósito).

## Conectar e desconectar

1. ComercialWeb → Configurações → Aplicativo Mobile → Gerar QR Code (vale 2 min, uso único).
2. Tela Conectar: nome do aparelho (editável; aparece no painel) → Ler QR Code. O link também abre pelo scheme `comercialweb://` (câmera do sistema), com confirmação antes de conectar.
3. Menu → Desconectar revoga o aparelho (`/auth/logout`, falha de rede é ignorada), apaga o armazenamento seguro e volta a Conectar. Trocar de servidor = desconectar + ler outro QR.

## Verificações

```bash
npm run check    # lint + typecheck + testes
```

## Backend (API .NET 11)

Requer SDK .NET 11 (versão em `backend/global.json`). Sem instalação global:

```bash
curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 11.0 --quality preview --install-dir ~/.dotnet
export DOTNET_ROOT=~/.dotnet PATH=~/.dotnet:$PATH
```

A API usa o MySQL do ComercialWeb (somente leitura nas tabelas dele; escreve só em `mobile_*`).
Configuração por variável de ambiente, nunca em arquivo versionado:

```bash
cd backend
export ConnectionStrings__ComercialWeb="Server=127.0.0.1;Port=3306;User ID=...;Password=...;Database=..."
dotnet run --project src/ComercialWeb.Mobile.Api -- migrate      # cria/atualiza tabelas mobile_*
dotnet run --project src/ComercialWeb.Mobile.Api --launch-profile http   # http://localhost:5052
```

No app (`mobile/.env.local`): `EXPO_PUBLIC_API_URL=http://10.0.2.2:5052/api` (emulador Android enxerga o host em `10.0.2.2`).

Testes (os de integração usam um MySQL descartável):

```bash
export MYSQL_ROOT_PASSWORD=$(openssl rand -hex 16)
docker compose up -d --wait
MOBILE_TEST_MYSQL="Server=127.0.0.1;Port=3317;User ID=root;Password=$MYSQL_ROOT_PASSWORD" dotnet test
```

## iOS

Mesmo código. Build e assinatura em Mac com Xcode (`npm run ios`) ou EAS Build na nuvem.

## Branches

`feature/*` → `dev` (homologação) → PR → `main` (produção).
