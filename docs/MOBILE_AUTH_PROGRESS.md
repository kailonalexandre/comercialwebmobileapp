# Autenticação mobile por aparelho — progresso

Arquivo de retomada (pedido em 2026-10-15). Se a sessão cair, retomar daqui conferindo o código real.

Branches: mobile `feature/mobile-device-auth` (de `dev`); ComercialWeb `feature/mobile-device-auth` no worktree
`~/comercialWeb/comercial-web-mobile-auth` (de `dev` do ComercialWeb, sem commit/push até revisão).

## Decisões (usuário, 2026-10-15)

- ComercialWeb pode ser alterado nesta feature (worktree próprio, sem commit/push).
- Funcionário sem acesso Web = linha em `users` marcada "só app" (`mobile_accounts.mobile_only`), login Web bloqueado em
  `AccountStatusService::canAuthenticate`. Reaproveita perfis/permissões spatie, `business_user.employee_person_id`,
  `seller_user_id` das vendas e todos os endpoints mobile existentes. Nenhuma pessoa duplicada.
- Credencial: senha individual (definida por convite de uso único gerado no painel) + PIN de 6 dígitos validado no
  servidor, aceito só em aparelho compartilhado vinculado à empresa, com bloqueio após 5 erros.

## Arquitetura (resumo)

- Autoridade de identidade, aparelho, credencial e permissão: **ComercialWeb**. A API .NET continua a única porta do app
  (JWT 10 min + refresh rotativo com detecção de reuso) e revalida o aparelho no ComercialWeb a cada refresh.
- Aparelho = `mobile_terminals` (empresa, modo pessoal/compartilhado, unidade, segredo do aparelho em hash). O QR
  (`comercialweb://bind?code=…`) só vincula o aparelho; não carrega sessão nem identifica usuário.
- Sessão do funcionário = `mobile_devices` (já existia: par de tokens do ComercialWeb por usuário) agora com `terminal_id`.
- QR antigo (`comercialweb://pair?…`, sessão do usuário Web que gerou) segue funcionando atrás de `mobile.legacy_pairing`
  / `Auth:LegacyPairing` até a migração terminar.

## Etapas

- [x] 1. ComercialWeb: migrations (terminais, contas mobile, convites, auditoria; colunas em pairings/devices)
- [x] 2. ComercialWeb: serviços (vínculo, login senha/PIN/convite, PIN, bloqueio, auditoria) + rotas assinadas
- [x] 3. ComercialWeb: bloqueio do login Web para conta só app
- [x] 4. ComercialWeb: painel (aparelhos, QR de vínculo, sessões, funcionários, convites, auditoria, sessões antigas)
- [x] 5. ComercialWeb: testes PHPUnit
- [x] 6. .NET: migration 0007, vínculo/estado/login por aparelho, políticas por modo, auditoria, PIN, troca de empresa
- [x] 7. .NET: testes
- [x] 8. App: armazenamento do aparelho, vínculo por QR, login/convite/PIN/operadores, bloqueio por inatividade,
      revogação, sessão expirada, informações do aparelho, autorização offline limitada
- [x] 9. App: testes + `npm run check`
- [x] 10. Docs (ARCHITECTURE, MOBILE_API) e borda (nginx/ingress)

## Testes executados

- 2026-10-15 ComercialWeb (container descartável, sqlite): `app/Modules/Mobile/Tests` + `tests/Feature/Auth` + `app/Modules/Person`
  = 324 ok; `--filter Mobile` (todas as rotas de máquina) = 86 ok; Pint ok. Novo: `MobileTerminalAuthTest` (24).
- 2026-10-15 .NET: `dotnet build -warnaserror` ok; `dotnet test` com MySQL 8.4 descartável = 295 ok, 0 pulados.
  Novo: `Identity/TerminalAuthTests.cs` (unidade + API).

- 2026-10-15 App: `npm run check` (lint + typecheck + jest) = 114 ok. Novos: `pin.test.ts`, casos em `session-store.test.ts`
  e `pairing.test.ts`.
- 2026-10-15 (2ª rodada): biometria presa a item `requireAuthentication` do SecureStore (troca de digital/rosto invalida
  e pede senha), deep link `comercialweb://bind`, expurgo diário da auditoria (`mobile-audit-prune`, 03:30). ComercialWeb 326 ok,
  app 115 ok.
- Execução final do dia: as três suítes acima repetidas depois da última alteração, todas verdes.

## Não testado / pendências

- Nada rodou num aparelho de verdade: precisa de APK novo e do ComercialWeb com a migration aplicada (ambiente dev).
- Teste de ponta a ponta app → .NET → ComercialWeb real: os testes usam ComercialWeb falso (.NET) e sqlite (Laravel).
- Prova de posse do aparelho é o segredo no Keychain/Keystore (não chave assimétrica não exportável, que pediria módulo nativo).
- PIN no compartilhado: quem está com o aparelho pode bloquear um colega errando o PIN 5 vezes (o PIN cai, a senha volta).
- Lista de operadores confere `mobile.access` usuário a usuário (até 200); paginar se a equipe for grande.
- Commit/push e merge: nada feito (aguarda revisão). ComercialWeb no worktree `~/comercialWeb/comercial-web-mobile-auth`.

