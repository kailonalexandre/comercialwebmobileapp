# Arquitetura — ComercialWeb Mobile

Regras completas: [COMERCIALWEB_MOBILE_INICIO.md](../COMERCIALWEB_MOBILE_INICIO.md). Este arquivo registra só as decisões tomadas.

## Stack (verificada em 2026-09-28)

| Componente | Versão | Observação |
|---|---|---|
| Expo SDK | 57 | React Native 0.86, React 19.2, Expo Router |
| Node | 24 LTS | `.nvmrc`; Node 26 local funciona, CI usa LTS |
| JDK | 21 | Build Android |
| Android SDK | cmdline-tools em `~/Android/Sdk` | emulador `android-36` x86_64 |
| .NET | 11 (RC1 hoje, GA prevista nov/2026) | backend da API mobile — ainda não criado |
| MySQL | 8.4 | mesma versão do ComercialWeb (`compose.yaml`) |

iOS: mesmo código; build/assinatura via Mac + Xcode ou EAS Build (nuvem).

## Repositório

```text
mobile/                 app Expo (Feature-Based)
  src/app/              rotas Expo Router — somente rotas
  src/features/<x>/     telas, hooks e chamadas próprias da feature
  src/shared/           componentes, tema (tokens) e utils reutilizáveis
  src/infrastructure/   api (cliente HTTP), storage (SecureStore), security (sessão)
backend/                API .NET 11 — criado quando começar a integração
docs/
```

## Sistema existente (ComercialWeb)

Laravel 13 / PHP 8.3 / MySQL 8.4 em `~/comercialWeb/comercial-web` (somente leitura para este projeto).

- **Tenant = `Business`.** Usuário pertence a várias empresas (`business_user`, com `status`). Empresa ativa em `user_preferences.current_business_id`, validada por `App\Core\Tenancy\CurrentBusiness` (empresa `active` + vínculo `active`).
- **Escopo:** trait `BelongsToBusiness` + `TenantContext`; escrita cross-tenant lança `CrossTenantWriteException`.
- **Permissões:** spatie/laravel-permission com *teams* (`team_id` = business).
- **Módulos:** `app/Modules/*` (Cadastros, Comercial, Estoque, Financial, Pdv, Notifications…). Só `Pdv` expõe API hoje (segredo de terminal, sem Sanctum).

## Backend .NET 11 — decisão e riscos

Decisão do desenvolvedor: API mobile em **.NET 11 separado**, Modular Monolith + DDD + Clean Architecture, acessando o MySQL do ComercialWeb.

Risco principal: regras de tenancy, permissão, preço, estoque e venda já vivem em PHP. Reimplementar em C# cria duas fontes de verdade. Mitigações obrigatórias:

1. **Leitura primeiro.** Começar por consultas (dashboard, produtos, clientes). Escritas críticas (venda, estoque, financeiro) só depois de mapear o Service Laravel correspondente, com testes de paridade contra o mesmo banco.
2. **Tenancy replicada exatamente:** toda query filtra `business_id` resolvido da sessão server-side, revalidando `businesses.status = active` e `business_user.status = active`. Nunca aceitar `business_id` do cliente como autorização.
3. **Permissões lidas das tabelas spatie** (`model_has_roles`, `role_has_permissions`, `model_has_permissions`) filtrando `team_id`.
4. **Migrations:** o schema pertence ao Laravel. O .NET não roda migrations nas tabelas do ComercialWeb; tabelas próprias (`mobile_sessions`, `mobile_devices`) são criadas por migration Laravel ou schema separado — decidir antes do primeiro endpoint.

## Autenticação (proposta)

- `POST /api/v1/auth/login` com e-mail/senha; senha verificada contra o hash bcrypt do Laravel (`users.password`).
- **Access token** JWT curto (10–15 min), assinado com chave assimétrica guardada só no servidor.
- **Refresh token** opaco, aleatório, **rotacionado a cada uso**, armazenado em hash em `mobile_sessions` (user, device, business ativo, expiração, revogado_em). Reuso de refresh token antigo revoga toda a sessão.
- `POST /api/v1/auth/logout` revoga a sessão server-side; o app apaga o SecureStore mesmo sem rede.
- Troca de empresa: endpoint dedicado; empresa ativa fica na sessão server-side, nunca no token enviado pelo cliente.
- Rate limit e bloqueio progressivo no login. Mensagem de erro única (não revela se o e-mail existe).

No app: tokens em `expo-secure-store` com `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; `android.allowBackup=false`; 401 força logout; retry automático desabilitado por padrão; `Idempotency-Key` em operações com efeito financeiro/estoque.

## Threat model inicial

| Ameaça | Controle |
|---|---|
| Extração do APK/IPA | Nenhum segredo no bundle; `EXPO_PUBLIC_*` só para URL pública |
| Troca de `business_id`/IDs (IDOR/BOLA) | Escopo de tenant e ownership resolvidos no servidor; testes cross-tenant |
| Token roubado do aparelho | SecureStore (Keychain/Keystore), sem backup, access token curto, revogação |
| Replay de refresh token | Rotação + detecção de reuso |
| MITM | HTTPS obrigatório fora de dev (validado em `resolveApiBaseUrl`); nunca desabilitar validação de certificado |
| Double tap / retry em venda | `Idempotency-Key` + deduplicação server-side; sem retry automático em POST |
| Preço/total adulterado | Servidor recalcula tudo que tem impacto financeiro, fiscal ou de estoque |
| Vazamento em logs | Sem `console.log`; erros ao usuário genéricos com correlation ID (`X-Correlation-ID`) |
| Força bruta no login | Rate limit por IP + conta no servidor |
| Deep links maliciosos | Scheme `comercialweb` sem ações sensíveis; validar parâmetros quando surgirem rotas via link |

## Pendências

- Definir onde nascem as tabelas `mobile_*` (migration Laravel vs schema separado).
- Confirmar identificador definitivo do app (`br.com.comercialweb.mobile` é provisório; não muda após publicar na loja).
- Backend .NET: aguardar .NET 11 GA ou aceitar RC (go-live) conscientemente.
