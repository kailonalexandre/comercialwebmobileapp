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

## Rodar

```bash
cd mobile
npm ci
cp .env.example .env.local      # opcional; sem URL = sessão fictícia em dev
npm run android                 # gera android/, compila e instala no emulador/aparelho
```

Qualquer e-mail válido e senha não vazia entram no modo fictício.

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
