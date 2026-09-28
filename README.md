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

## iOS

Mesmo código. Build e assinatura em Mac com Xcode (`npm run ios`) ou EAS Build na nuvem.

## Branches

`feature/*` → `dev` (homologação) → PR → `main` (produção).
