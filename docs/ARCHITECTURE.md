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

### Implementado (módulo Identity)

- `backend/`: ASP.NET Core 11 (minimal APIs), Dapper + MySqlConnector. Projetos: `Api` (host), `Modules/Identity`, testes.
- **Tabelas próprias** `mobile_sessions` e `mobile_refresh_tokens`, no mesmo banco do ComercialWeb, criadas por `db/migrations/*.sql` via `dotnet ComercialWeb.Mobile.Api.dll migrate` (pipeline, nunca na subida). FKs para `users`/`businesses` com `ON DELETE CASCADE` para não bloquear a web.
- Tabelas do Laravel: **somente leitura**, com uma única exceção (`notifications`, abaixo). Usuário MySQL próprio da API, com privilégios mínimos:

```sql
GRANT SELECT ON <banco>.* TO 'mobile_api'@'%';
GRANT INSERT, UPDATE, DELETE ON <banco>.mobile_sessions TO 'mobile_api'@'%';
GRANT INSERT, UPDATE, DELETE ON <banco>.mobile_refresh_tokens TO 'mobile_api'@'%';
GRANT INSERT ON <banco>.mobile_schema_migrations TO 'mobile_api'@'%';       -- só para o comando migrate
GRANT UPDATE (read_at, archived_at, updated_at) ON <banco>.notifications TO 'mobile_api'@'%';
```

  (`migrate` precisa de DDL em `mobile_*`; rode-o com uma conta de deploy separada, não com a da API em execução.)
- Login replica `LoginRequest` + `AccountStatusService` + `LoginThrottle` do ComercialWeb: e-mail ou username; ignora `deactivated_at`/`deleted_at`; exige vínculo ativo em empresa ativa; 5 falhas/min e 20/h por login+IP; mesma resposta para qualquer motivo.
- **Diferença deliberada:** contas de plataforma (superadmin/suporte) sem empresa não entram no app.
- Empresa da sessão: preferência da web (`user_preferences.current_business_id`) se o vínculo estiver ativo; senão a primeira ativa. Fica na sessão mobile; a preferência da web não é alterada.
- Cada request autenticado revalida sessão, usuário e vínculo com a empresa (`IsSessionActiveAsync`): logout, desativação e remoção de vínculo valem na hora.
- Endpoints: `POST /api/v1/auth/login|refresh|logout`, `GET /api/v1/me`, `GET /health`.

### Permissões (todas as rotas de negócio)

`RequirePermission("<permissão da web>")` replica o Gate do ComercialWeb: admin de plataforma recebe tudo **exceto** as alçadas discricionárias (`BusinessDiscretionPermissions`); os demais precisam da permissão spatie via papel (`model_has_roles`) ou direta (`model_has_permissions`) **no `business_id` da sessão**. Permissão em outra empresa não vale. Suporte de plataforma não tem janela de supervisão no app. Sem permissão: 403 genérico.

### Módulo Catalog

- `GET /api/v1/products?search=&includeInactive=&page=&pageSize=` e `GET /api/v1/products/{id}`, permissão `products.view`.
- Só produtos da empresa da sessão, sem excluídos; inativos só com `includeInactive=true`. Produto de outra empresa: 404.
- Busca igual à web (nome, SKU, código de barras + variantes UPC/EAN, `product_barcodes`, referência/código de variação, código exato), mas `%` e `_` são escapados.
- `pageSize` 1–50, `page` 1–10000; fora disso 422. Preço em centavos (`salePriceCents`); custo e margens não são expostos.
- Saldo de estoque ainda não exposto (depende de locais de estoque e variações; módulo Inventory).

### Módulo Customers

- `GET /api/v1/customers?search=&includeInactive=&page=&pageSize=` e `GET /api/v1/customers/{id}`, permissão `people.view` (a mesma da web).
- Cliente = `people.is_client = 1`, empresa da sessão, sem excluídos; fornecedor puro, excluído ou de outra empresa: 404.
- Busca igual à web (nome, fantasia, código, documento, telefone, celular); documento e telefones comparados só pelos dígitos, então CPF/telefone com máscara também acham.
- Minimização (LGPD): o app recebe identificação, contato, endereço principal e as flags `restrictionAlert`/`restrictionBlock`. Limite de crédito, motivo da restrição, observações e dados de renda não são expostos.

Paginação, `PagedResult` e escape de LIKE ficam em `src/Common` (compartilhado pelos módulos).

### Unidade de operação (loja/filial)

- Espelha `App\Shared\Tenancy\CurrentLocation`: candidatas = unidades (`storage_locations.type = 'unit'`) ativas da empresa; se o usuário tiver unidades permitidas (`user_storage_locations`), só elas. Escolha: preferida → principal (`primary_marker`) → primeira por nome.
- Resolvida **a cada request a partir da preferência da web** (`user_preferences.current_location_id`), exatamente como a web: app e navegador operam sempre na mesma unidade, e a pré-venda enviada ao ComercialWeb cai na unidade que o app mostra. Unidade desativada ou proibida cai no fallback sem relogar.
- Achado na web (espelhado, não corrigido aqui): `allowedLocations` não filtra por empresa, então restrição cadastrada na empresa B deixa o usuário sem unidade na empresa A.
- `/api/v1/me` informa a unidade atual. Sem unidade operável: 409 nas rotas que dependem dela.

### Módulo Sales (consulta)

- `GET /api/v1/sales?search=&status=&from=&to=&page=&pageSize=` e `GET /api/v1/sales/{id}`, permissão `sales.view` (a mesma da "Consulta de Vendas" da web; lançar venda é `sales.access`).
- Recorte igual à web: empresa **e unidade** da sessão, sem consolidar filiais; excluídas fora. Venda de outra unidade/empresa: 404.
- `status` só aceita `pendente`, `pre_venda`, `finalizada`, `devolucao` (inclui `troca`), `condicional_aberto|fechado|cancelado`; outro valor: 422. Período por `DATE(created_at)`.
- Datas no horário local da empresa (America/Sao_Paulo), sem offset, exatamente como gravadas e exibidas pela web. Valores em centavos.

### Módulo Dashboard

- `GET /api/v1/dashboard`: mesmos cards e consultas do `DashboardRepository` da web. Cada bloco só vem se o usuário tiver a permissão do card na web (senão `null`): vendas de hoje e condicionais abertos (`sales.view`), contas a receber (`financial.receivables.view`), estoque baixo (`inventory.view`), últimas 8 vendas (`sales.view`).
- Escopo: **empresa inteira, todas as unidades** (como o dashboard da web; `BelongsToUnit` só preenche a unidade na criação, não filtra leitura). Excluídos fora.
- "Hoje" no fuso da empresa (`ComercialWeb:TimeZone`, padrão `America/Sao_Paulo`, o `APP_TIMEZONE` da web), sobre `COALESCE(occurred_at, created_at)`.
- Contas a receber vêm de `financial_lines` (tabela do model `FinancialTitle`): abertas, não agrupadas, `amount - paid`.
- Estoque baixo: saldo negativo, ou mínimo > 0 (do produto; senão soma das variações) com saldo ≤ mínimo; só produtos ativos.
- Emissão e validação do JWT usam o mesmo `TimeProvider` injetável (expiração 10 min, tolerância 30 s, testada ponta a ponta).

### Módulo Notifications

- `GET /api/v1/notifications?status=active|archived&read=read|unread&domain=&severity=&search=&page=&pageSize=`, `GET /api/v1/notifications/unread-count`, `POST /api/v1/notifications/{id}/read`, `POST /api/v1/notifications/{id}/archive`, `POST /api/v1/notifications/read-all`. Só exige login (como na web); o recorte é sempre o usuário da sessão.
- Listagem e contador: do usuário, da empresa da sessão **ou sem empresa**, ativas por padrão, mais novas primeiro. Contador = ativas e não lidas, com as críticas à parte.
- Estado lido/arquivado vive na tabela do ComercialWeb (`notifications`) para que ler no celular também some do sino da web. É a **única escrita** do app em tabela do ComercialWeb: só `read_at`, `archived_at`, `updated_at`, só de linhas do próprio usuário (outro usuário ou id inexistente: 404), com a semântica de `NotificationRepository` (arquivar também marca como lida; marcar lida é idempotente). A web não tem observer nem efeito colateral nessas colunas.
- Datas gravadas no horário local da empresa (`LocalTime`, `ComercialWeb:TimeZone`).
- Não expõe `url` (rota da web) nem `context`; envia `entityType`/`entityId` para o app navegar por conta própria.
- **Push** (FCM/APNs) fica para fase posterior: exige tabela de dispositivos, provedor e consentimento.

### Pré-venda (app → ComercialWeb)

Decisão (2026-09-29): o app é uma **extensão do ComercialWeb**. Lê vendas direto do banco e **envia pré-vendas para o ComercialWeb**, que aplica as próprias regras. Nenhuma regra de venda é reimplementada em .NET.

```text
App ──POST /api/v1/pre-sales (Idempotency-Key)──► API .NET ──POST /api/mobile/v1/pre-sales (HMAC)──► ComercialWeb
                                                                                                 └─ SaleDraftService::finalize(isPreSale)
```

- App envia só cliente, vendedor (opcional), observação e itens `{productId, quantity}`. **Preço, desconto e total são calculados no ComercialWeb.**
- `Idempotency-Key` (UUID gerado no app ao montar o pedido) vira `sales.client_sale_uuid`; o índice único `(business_id, client_sale_uuid)` garante uma venda só, mesmo com reenvio ou chamadas simultâneas. Resposta 201 criada, 200 reenvio.
- Usuário e empresa vêm da sessão validada pela API .NET, nunca do corpo do app. O ComercialWeb confere de novo conta, vínculo, `sales.access` + `sales.create`, cliente bloqueado, limite de desconto e estoque (a pré-venda baixa estoque, como na web).
- No ComercialWeb, a empresa entra por `CurrentBusiness::supervise()` (não altera a empresa selecionada no navegador) e o rascunho vive em memória (`InMemorySaleDraftStore`), sem tocar no rascunho de sessão da web.
- Assinatura servidor-a-servidor: HMAC-SHA256 de `"{timestamp}\n{MÉTODO}\n{caminho}\n{corpo}"`, janela de 5 min. Verificada em PHP e C# com o mesmo vetor.
- Erros para o app: 422 com `message` de regra de negócio (ex.: cliente bloqueado), 403 sem permissão, 503 quando o ComercialWeb está fora ou mal configurado (o app reenvia com a mesma chave).
- Configuração (somente em variáveis de ambiente dos servidores):
  - API .NET: `ComercialWeb__BaseUrl`, `ComercialWeb__MobileApiSecret`.
  - ComercialWeb: `MOBILE_API_SECRET` (mesmo valor). Sem ele, a rota de máquina recusa tudo (401).
  - O caminho assinado supõe o ComercialWeb servido na raiz do domínio.
- Venda finalizada com pagamento (PDV móvel) fica para fase posterior; reutilizará o commit idempotente do PDV.

## Autenticação

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
| Deep links maliciosos | Scheme `infinitcomercial` sem ações sensíveis; validar parâmetros quando surgirem rotas via link |

## Pendências

- Throttle de login em memória por instância: mover para Redis antes de rodar mais de uma instância permanente.
- Chave JWT de produção (PEM EC P-256) via secret do ambiente em `Jwt:SigningKeyPath`; em desenvolvimento é efêmera.
- Identificador do app: `br.com.infinitsolucoesweb.comercial` (Android e iOS). Não muda após publicar na loja.
- Backend .NET: aguardar .NET 11 GA ou aceitar RC (go-live) conscientemente.
