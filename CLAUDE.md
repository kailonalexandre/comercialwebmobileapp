# ComercialWeb Mobile — regras para Claude Code

- Regras completas: `COMERCIALWEB_MOBILE_INICIO.md`. Decisões tomadas: `docs/ARCHITECTURE.md`.
- App em `mobile/` (Expo SDK 57, Expo Router). Leia `mobile/AGENTS.md` antes de mexer em APIs Expo/RN.
- Dependências: `npx expo install <pkg>` (nunca `npm install <pkg>` direto).
- ComercialWeb existente (`~/comercialWeb/comercial-web`, Laravel) é **somente leitura**.
- Estrutura: rotas só em `src/app/`; código de feature em `src/features/<x>/`; reutilizável em `src/shared/`; HTTP/storage/sessão em `src/infrastructure/`.
- Valores visuais só via `src/shared/theme/tokens.ts`.
- Nunca: segredo no app, `console.log`, retry automático em POST sem `Idempotency-Key`, `company_id`/`business_id` do cliente como autorização.
- Antes de concluir: `cd mobile && npm run check` (lint + typecheck + testes).
- Branches: `feature/*` a partir de `dev`; `main` = produção, só via PR `dev → main`. Sem commit/push sem pedido.
