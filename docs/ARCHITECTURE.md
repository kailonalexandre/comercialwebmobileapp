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
GRANT INSERT, UPDATE, DELETE ON <banco>.mobile_push_tokens TO 'mobile_api'@'%';
GRANT INSERT ON <banco>.mobile_sale_origins TO 'mobile_api'@'%';
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
- Saldo de estoque: `GET /api/v1/products/{id}/stock` (`products.view`) devolve `{productId, unitId, totalMilli}` da unidade do aparelho. **Não é calculado aqui**: a regra (grade de variações, linhas legadas, endereços da unidade) é do ComercialWeb, e a API só chama `GET /api/mobile/v1/products/{id}/stock` com o token do aparelho (`DeviceLink.CallAsync`, que renova o token dele se expirou). Produto de outra empresa: 404 sem consultar o ComercialWeb; ComercialWeb fora: 503; recusa dele: 403. Sessão sem vínculo com o ComercialWeb (login por senha antigo): 503.

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

### Pedidos (Loja Virtual e marketplaces)

- `GET /api/v1/orders?source=all|store|mercadolivre&status=&search=&page=&pageSize=` (`loja-virtual.access` **ou** `marketplaces.view`) e `GET /api/v1/orders/marketplace/{id}` (`marketplaces.view`).
- É o Monitor de Pedidos da web: a API não tem regra própria, só repassa `GET /api/mobile/v1/orders` e `/orders/marketplace/{id}` com o token do aparelho (`DeviceLink.CallAsync`). Resposta `{sections: [{channel, failure, meta, items}]}`, uma seção por canal com paginação própria; `failure` preenchido = a fonte externa estava fora (o app mostra erro com "tentar de novo", não lista vazia).
- Cada canal exige a própria permissão também na API (`source=store` → `loja-virtual.access`, `mercadolivre` → `marketplaces.view`, `all` → as duas): não confiamos que o ComercialWeb filtre as seções por permissão. Parâmetro inválido: 422 sem consultar o ComercialWeb. ComercialWeb fora: 503. Recusa dele na lista: 403; no detalhe: 404 (a permissão já foi conferida aqui).
- App: aba de canais conforme as permissões do usuário (`/me/permissions` agora inclui as duas). Só pedido de marketplace tem detalhe; o da Loja Virtual ainda não existe na API do ComercialWeb.

### Desconto e comprovante (venda)

- **Desconto:** `POST /api/v1/pre-sales` e `/api/v1/pdv/quote|sales` aceitam por item `discountPercent` (0 a 99,99, até 2 casas) **ou** `discountCents`, e na venda `saleDiscountPercent` **ou** `saleDiscountCents`; nunca os dois do mesmo par (422 sem chamar o ComercialWeb). O app só envia a intenção: o ComercialWeb recalcula tudo, aplica `pdv.discount` e o limite de desconto do cliente e responde `discount_limit_exceeded` (com a mensagem para o operador) ou `business_rule`. O total mostrado vem do `/pdv/quote` (que devolve `discountCents` total e por item), nunca calculado no aparelho.
- **Limites do comprovante:** o rate limit é da borda (seção "Borda" abaixo), não da API. Resposta do ComercialWeb lida com teto de 15 MB; `reason` só aceita `connection_missing` e `customer_phone_missing`, e `code` só `business_rule`/`forbidden`/`not_found`/`validation`. No app o PDF fica no cache até o próximo comprovante (não é apagado ao abrir a folha de compartilhar, para o app de destino conseguir lê-lo).
- **Comprovante:** `POST /api/v1/sales/{id}/receipt/whatsapp` (corpo opcional `{phone}`) pede ao ComercialWeb que envie o PDF pelo WhatsApp da empresa, com o template configurado lá; 202 na fila; 422 com `reason` `connection_missing` ou `customer_phone_missing`. `POST /api/v1/sales/{id}/receipt/pdf` devolve o PDF (só se o ComercialWeb responder `application/pdf`, até 15 MB; nome do arquivo sanitizado) para o app compartilhar por outros apps. Basta uma destas permissões: `sales.view`, `sales.access`, `pdv.access`; empresa e usuário vêm da sessão e o ComercialWeb confere de novo (venda de outra empresa: 404).

### Módulo Dashboard

- `GET /api/v1/dashboard`: mesmos cards e consultas do `DashboardRepository` da web. Cada bloco só vem se o usuário tiver a permissão do card na web (senão `null`): vendas de hoje e condicionais abertos (`sales.view`), contas a receber (`financial.receivables.view`), estoque baixo (`inventory.view`), últimas 8 vendas (`sales.view`).
- Escopo: **empresa inteira, todas as unidades** (como o dashboard da web; `BelongsToUnit` só preenche a unidade na criação, não filtra leitura). Excluídos fora.
- "Hoje" no fuso da empresa (`ComercialWeb:TimeZone`, padrão `America/Sao_Paulo`, o `APP_TIMEZONE` da web), sobre `COALESCE(occurred_at, created_at)`.
- Contas a receber vêm de `financial_lines` (tabela do model `FinancialTitle`): abertas, não agrupadas, `amount - paid`.
- Estoque baixo: saldo negativo, ou mínimo > 0 (do produto; senão soma das variações) com saldo ≤ mínimo; só produtos ativos.
- Emissão e validação do JWT usam o mesmo `TimeProvider` injetável (expiração 10 min, tolerância 30 s, testada ponta a ponta).

### Permissões do usuário para o app

- `GET /api/v1/me/permissions` devolve, entre as permissões que o app usa (`products.view`, `people.view`, `sales.view`, `sales.create`, `financial.receivables.view`, `inventory.view`), as que o usuário tem **na empresa da sessão**, com a mesma decisão das rotas (`IPermissionChecker`). A lista vem das constantes que as próprias rotas exigem.
- Serve para o app esconder o que o usuário não pode usar. **Não é autorização**: cada rota confere no servidor.

### Módulo Notifications

- `GET /api/v1/notifications?status=active|archived&read=read|unread&domain=&severity=&search=&page=&pageSize=`, `GET /api/v1/notifications/unread-count`, `POST /api/v1/notifications/{id}/read`, `POST /api/v1/notifications/{id}/archive`, `POST /api/v1/notifications/read-all`. Só exige login (como na web); o recorte é sempre o usuário da sessão.
- Listagem e contador: do usuário, da empresa da sessão **ou sem empresa**, ativas por padrão, mais novas primeiro. Contador = ativas e não lidas, com as críticas à parte.
- Estado lido/arquivado vive na tabela do ComercialWeb (`notifications`) para que ler no celular também some do sino da web. É a **única escrita** do app em tabela do ComercialWeb: só `read_at`, `archived_at`, `updated_at`, só de linhas do próprio usuário na empresa da sessão ou sem empresa (outro usuário, outra empresa ou id inexistente: 404), com a semântica de `NotificationRepository` (arquivar também marca como lida; marcar lida é idempotente). A web não tem observer nem efeito colateral nessas colunas.
- Datas gravadas no horário local da empresa (`LocalTime`, `ComercialWeb:TimeZone`).
- Não expõe `url` (rota da web) nem `context`; envia `entityType`/`entityId` para o app navegar por conta própria.
- **Push**: ver a seção "Push (Expo)" abaixo.

### Push (Expo)

- App: após entrar, pede permissão, cria o canal Android `default`, obtém o Expo push token (`extra.eas.projectId` do `app.json`) e faz `PUT /api/v1/me/push-token {token, platform}`. Sem projectId, permissão negada, aparelho sem Play Services ou qualquer erro: não registra e segue (nunca bloqueia o login). No logout: `DELETE /api/v1/me/push-token` (melhor esforço). Tocar na notificação abre `/notificacoes`.
- Preferências: `GET/PUT /api/v1/me/push-preferences {mutedDomains: [...]}` (tabela `mobile_push_mutes`, migration 0005, por usuário). Domínio silenciado não gera push; o dispatcher avança a marca d'água por cima dele (reativar não despeja o passado) e o sino do app continua listando tudo. Tela: Configurações → Avisos no celular.
- API (módulo `Push`, tabela `mobile_push_tokens`, migration 0003): um token por sessão, UNIQUE no token (token que passa a outra sessão substitui a linha). Ao registrar, a marca d'água `last_notification_id` começa no maior id de notificações do usuário: as antigas não são enviadas.
- `PushDispatcher` (BackgroundService) consulta a cada `Push:PollSeconds` as sessões **ativas** (não revogadas nem expiradas) e envia, em ordem, as notificações `id > marca d'água` do escopo da sessão (usuário + empresa da sessão ou sem empresa), não lidas e não arquivadas, no máximo 50 por dispositivo por ciclo. A marca só avança após envio aceito pelo Expo. `DeviceNotRegistered` apaga o token; erro de rede/5xx ou recusa de uma mensagem: log de aviso sem segredo e nova tentativa no próximo ciclo. Título/corpo já são texto de usuário; o `data` leva só `notificationId`, `entityType`, `entityId`.
- **Venda feita pelo próprio app não gera aviso no celular** (só no web): a API marca toda venda que o app cria (pré-venda e PDV) em `mobile_sale_origins` (migration 0004), e o disparador não envia a notificação `entity_type = sale` cujo `entity_id` está ali, mas avança a marca d'água por cima dela. O sino dentro do app continua mostrando a notificação. Como a marca é gravada logo depois da resposta do ComercialWeb, o disparador espera `Push__OriginGraceSeconds` (padrão 8) antes de avisar qualquer notificação nova.
- Config: `Push__Enabled` (padrão `false`: nada roda), `Push__PollSeconds` (padrão 15), `Push__ExpoAccessToken` (opcional, só se a conta Expo exigir "enhanced security"; vai como Bearer e nunca é logado).
- Limitações: polling, não tempo real (atraso até `PollSeconds`); dispatcher de instância única. Com várias instâncias da API cada uma enviaria a mesma notificação, então antes disso é preciso um lock (ex.: `GET_LOCK` do MySQL).
- Para o push real chegar (não coberto por testes automáticos): criar o projeto EAS (`eas init`) e pôr o projectId em `expo.extra.eas.projectId` do `app.json`; criar o projeto Firebase, baixar o `google-services.json` (fora do git) e apontar `expo.android.googleServicesFile`; enviar a chave FCM V1 ao Expo (`eas credentials`); gerar novo build; ligar `Push__Enabled=true` na API.

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

- **Login por QR (2026-09-29):** o app lê `comercialweb://pair?code=…` e chama `POST /api/v1/auth/pair {code, deviceName}` na API .NET. Detalhes em "Pareamento por QR" abaixo. `POST /auth/login` (e-mail/senha) segue no código, mas **desligado** (404) salvo `Auth__PasswordLogin=true`; só testes e desenvolvimento usam.
- **Access token** JWT curto (10–15 min), assinado com chave assimétrica guardada só no servidor.
- **Refresh token** opaco, aleatório, **rotacionado a cada uso**, armazenado em hash em `mobile_sessions` (user, device, business ativo, expiração, revogado_em). Reuso de refresh token antigo revoga toda a sessão.
- `POST /api/v1/auth/logout` revoga a sessão server-side; o app apaga o SecureStore mesmo sem rede.
- Troca de empresa: endpoint dedicado; empresa ativa fica na sessão server-side, nunca no token enviado pelo cliente.
- Rate limit e bloqueio progressivo no login. Mensagem de erro única (não revela se o e-mail existe).

No app: tokens em `expo-secure-store` com `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; `android.allowBackup=false`; 401 força logout; retry automático desabilitado por padrão; `Idempotency-Key` em operações com efeito financeiro/estoque.

## Borda: rate limit e IP do cliente

**Decisão (2026-09-30):** a API .NET **não tem rate limit próprio**. Limite de requisições é responsabilidade da borda (Traefik no K3s de produção; nginx no Compose de dev), antes da aplicação: assim o bloqueio acontece antes de gastar CPU, conexão de banco ou chamada ao ComercialWeb, e o limite não depende de a API enxergar o IP certo.

| Rota | Limite sugerido | Chave |
|---|---|---|
| `POST /api/v1/auth/pair` | 10/min (rajada 5) | IP do cliente |
| `POST /api/v1/auth/refresh` | 30/min | IP do cliente |
| `POST /api/v1/sales/*/receipt/whatsapp` e `/pdf` | 20/min | cabeçalho `Authorization` (uma sessão) |
| demais rotas `/api/v1/*` | 120/min | IP do cliente |

- **Por que o comprovante é sensível:** cada chamada ao WhatsApp usa o número da empresa; sem limite um vendedor dispara envios em massa.
- **Traefik (K3s):** `Middleware` `rateLimit` (`average`, `period`, `burst`, `sourceCriterion`) ligado por `IngressRoute`, um por grupo de rotas. Conferir `ipStrategy.depth` com o que o Traefik realmente enxerga (o Service `traefik` está com `externalTrafficPolicy: Cluster`, que pode mascarar o IP de origem).
- **nginx (dev, Compose):** `limit_req_zone` por `$binary_remote_addr` (e por `$http_authorization` no comprovante) + `limit_req ... burst ... nodelay`, resposta 429.
- **IP do cliente na API:** só o proxy da borda pode dizer quem é o cliente. `ForwardedHeaders__KnownNetworks` lista o CIDR exato de quem fala com a API (rede de pods `10.42.0.0/16` atrás do Traefik; rede do container do nginx no Compose). Fora disso a API usa o IP da conexão. Esse IP vai ao ComercialWeb em `X-Mobile-Client-Ip` para o limite do `/pair` dele ser por aparelho.
- **Lembrete:** o ComercialWeb mantém os limites dele (`/pair` 10/min por IP de cliente, refresh por aparelho, 120/min autenticadas) como segunda barreira.

## Riscos conhecidos e decisões (revisão de 2026-09-29)

- **MySQL em dev:** o usuário `mobile_api` com privilégio mínimo é o correto. Em desenvolvimento local (container sem acesso root) a API usou temporariamente o usuário do próprio Laravel (privilégio total no banco dele). **Só dev**: produção e homologação usam `mobile_api`, e o `migrate` roda com uma conta de deploy separada.
- **Scheme `comercialweb://` não é exclusivo:** outro app instalado no aparelho pode registrá-lo e receber o `code` quando o QR é lido pela **câmera do sistema** (o leitor dentro do app não é afetado). O código é de uso único e vale 2 min, e o pareamento por deep link pede confirmação, mas o risco existe. Mitigação de longo prazo: App Links/Universal Links verificados (`https://<domínio>/pair?...`), o que depende do formato do QR gerado pelo ComercialWeb.
- **IP do cliente e proxies:** ver "Borda". Sem `ForwardedHeaders__KnownNetworks` a API enxerga o IP do proxy e todos os aparelhos caem no mesmo IP no ComercialWeb.
- **`X-Mobile-Client-Ip` fora da assinatura HMAC:** a assinatura cobre timestamp, método, caminho e corpo. Incluir o IP exige mudar o contrato do lado Laravel; hoje o risco é teórico (TLS entre os servidores, código de uso único).
- **Bloqueio por versão:** o `minAppVersion` só é reavaliado no pareamento e a cada refresh. Com a tela "Atualização necessária" aberta o app não faz requisições; se o administrador baixar a versão mínima, o aparelho sai do bloqueio ao desconectar e parear de novo (ou ao instalar a atualização).
- **Renovação do token do ComercialWeb:** serializada por sessão dentro de uma instância da API (`DeviceLink`); com várias instâncias seria preciso lock no banco (`GET_LOCK`).
- **429 do ComercialWeb nos repasses** (`/stock`, `/orders`) chega ao app como 503, e o app repete GET com backoff; um `Retry-After` repassado seria melhor.

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

## Pareamento por QR (app → .NET → ComercialWeb)

Decisão (2026-09-29): a API do app continua sendo o .NET; o app nunca fala com o ComercialWeb. O ComercialWeb expõe `/api/mobile/v1` (contrato em [MOBILE_API.md](MOBILE_API.md)) e o .NET é o cliente dele.

```text
App ──POST /api/v1/auth/pair {code}──► .NET ──POST /api/mobile/v1/pair──► ComercialWeb (valida código, cria o aparelho no painel)
                                       ├─ GET /bootstrap (Bearer) → user.id, business.id
                                       └─ cria mobile_sessions + JWT/refresh do .NET para o app
```

- O ComercialWeb decide quem é o usuário e a empresa; o app só manda o `code` (60 alfanuméricos, uso único, 2 min). Código inválido, expirado, já usado ou sem `mobile.access`: 422 igual. ComercialWeb fora do ar: 503.
- O par de tokens do ComercialWeb fica só no servidor, em `mobile_sessions.cw_tokens`, cifrado com Data Protection. Nunca chega ao app.
- **Servidor do ComercialWeb vem de `ComercialWeb__BaseUrl`, nunca do QR.** Um QR forjado não pode apontar a API para outro host (SSRF). O app não usa o `server` do QR como endereço de chamada; só o valida pelas regras do ambiente (`AppEnvironment`: HTTPS + allowlist em `vps`, HTTP só de rede privada em `local`) e recusa QR fora delas sem chamar a API.
- **Revogação:** a cada refresh do app (10 min) o .NET faz `GET /bootstrap` com o token do aparelho. Aparelho revogado no painel web, ou usuário/empresa diferentes: sessão revogada (`device_revoked`). Access do ComercialWeb expirado: renova com o refresh dele e guarda o novo par. ComercialWeb indisponível: **não** derruba o app (fail-open; o JWT segue revalidado contra usuário/empresa a cada chamada).
- Logout do app chama `/auth/logout` do ComercialWeb (melhor esforço) e revoga a sessão local.
- `/auth/pair` (10/min) e `/auth/refresh` (30/min) têm rate limit por IP. No refresh, só quem ganha a rotação do token consulta o ComercialWeb (evita corrida no refresh dele). Qualquer 4xx do ComercialWeb, exceto 429, conta como aparelho recusado; só 5xx, 429 e falha de rede são fail-open. `pair` que falha depois de criar o aparelho lá o desfaz com logout.
- Configuração em produção: `ComercialWeb__BaseUrl` (HTTPS obrigatório fora de dev), `DataProtection__KeysPath` (obrigatório fora de dev; volume persistente, fora de backup do banco, permissão 700; chave perdida = sessões pareadas caem e exigem novo QR). Migration `0002` só adiciona colunas anuláveis (`cw_device_id`, `cw_tokens`).
- **Versão mínima do app:** o `GET /bootstrap` que a API já faz no pareamento e em cada refresh traz `api.min_app_version`; a API o devolve ao app como `minAppVersion` (nunca inventa valor se o ComercialWeb não responde). O app compara com a própria versão e mostra a tela "Atualização necessária" se for menor; versão ausente ou ilegível nunca bloqueia.
- **`/pair` assinado (contrato atual do ComercialWeb):** o .NET assina o corpo exato com HMAC-SHA256 (`X-Mobile-Timestamp`, `X-Mobile-Signature`, mesmo helper `MobileSignature` da pré-venda e do PDV) usando `ComercialWeb__MobileApiSecret` (= `MOBILE_API_SECRET` do Laravel, 32+ caracteres, nunca versionado). Sem segredo configurado o pareamento fica indisponível (503) sem chamar o ComercialWeb. 401 no `/pair` significa segredo ou relógio divergente (janela de 5 min): vira 503 com log de erro, nunca "código inválido".
- **IP do aparelho:** o .NET envia `X-Mobile-Client-Ip` (IP resolvido pelo ForwardedHeaders, sem porta) para o rate limit do `/pair` ser por aparelho no ComercialWeb. Se alargar `KnownNetworks` de ForwardedHeaders, esse IP passa a ser falsificável via X-Forwarded-For.
- Rate limit das demais rotas (bootstrap, sales, sync, refresh) é por aparelho no ComercialWeb; 429 no `/bootstrap` segue fail-open.
- Pendente conhecido: `LoginThrottle` nunca remove chaves antigas (só importa com login por senha ligado); sessões de login por senha não têm vínculo com o ComercialWeb.
- Leituras (vendas, produtos, clientes, notificações) seguem por SQL direto por enquanto; migrar módulo a módulo para `/api/mobile/v1` remove a duplicação de regras.

## PDV móvel (venda finalizada com pagamento)

Mesmo desenho da pré-venda: o app fala só com o .NET, o .NET fala com o ComercialWeb por rotas de máquina assinadas (HMAC), e o ComercialWeb aplica as regras do PDV da web (`PdvSaleService` + `PdvSaleCommitService` idempotente).

```text
App ─POST /api/v1/pdv/quote|sales (Idempotency-Key)─► .NET ─POST /api/mobile/v1/pdv/{quote,sales,payment-methods} (HMAC)─► ComercialWeb
```

- **Preço e total são do servidor.** O app manda produto, quantidade inteira, cliente, observação e valores recebidos por forma; nunca preço nem total. A tela mostra o total da cotação (`/pdv/quote`), não o estimado.
- **Caixa aberto do operador é obrigatório** (o app não abre caixa). Sem caixa: 422 `cash_register_closed` e o app orienta a abrir no ComercialWeb.
- **Idempotência:** o `Idempotency-Key` vira `client_sale_uuid`. Reenvio devolve a venda já gravada (200) sem tocar em estoque, caixa ou financeiro, mesmo se o estoque acabou depois. Resultado incerto (rede, timeout, 5xx) não trava mais o carrinho: toda venda/pré-venda é gravada antes na fila local (`sales-queue.json` + cópia `.bak`, armazenamento privado) com a própria chave, e sobe sozinha (ao entrar, ao voltar ao primeiro plano e a cada 30 s com pendente). Estados Aguardando/Sincronizando/Sincronizado/Erro, listados em Vendas; recusa do servidor vira Erro (tentar de novo ou descartar). A fila não é apagada ao sair da conta e só sobe na empresa que a gravou. Sem conexão o PDV usa total estimado e a última lista de formas de pagamento; o ComercialWeb recalcula ao sincronizar. Clientes: cópia local dos ativos (`customers-cache.json`, baixada online a cada 6 h, apagada ao sair da conta) alimenta a escolha de cliente sem conexão. Produtos: cópia local por tabela de preço (`products-cache-<tabela>.json`, mesma regra de 6 h e de limpeza) alimenta a busca/leitor de código de barras e a troca de tabela sem conexão. Cliente cadastrado offline pode ser escolhido na venda: ela fica na fila até o cadastro subir e então passa a apontar para o id real (cadastro recusado deixa a venda em Erro). Venda em Erro pode ser editada (volta ao carrinho) ou descartada.
- **Formas liberadas na v1:** dinheiro, Pix, débito e crédito à vista (sem parcelamento). Lista vinda do ComercialWeb (`/pdv/payment-methods`, só as ativas da empresa).
- **Recusas com código estável** (422): `cash_register_closed`, `payment_incomplete` (com `totalCents`/`remainingCents`), `payment_method_not_allowed`, `business_rule` (estoque, cliente bloqueado, limite). Erro estrutural do Laravel não vaza mensagem.
- Permissão: `pdv.access`, conferida no .NET e de novo no ComercialWeb.
- Código do lado Laravel: worktree `~/comercialWeb/comercial-web-mobile-bridge`, branch `feature/mobile-pdv-sales` (commit f59abdf2, sem push nem merge; a integração no ComercialWeb é decisão do usuário).
- Pendente: parcelamento e cartão com operadora, abertura/fechamento de caixa e nota fiscal pelo app; emissão fiscal segue as regras da web (pode enfileirar NFC-e conforme a configuração da empresa).

## Cadastro rápido de cliente (app → .NET → ComercialWeb)
- App: Clientes → Novo. Só nome e telefone são obrigatórios; sem CPF/CNPJ o cliente nasce "incompleto". Fila local (`quick-customers.json`, armazenamento privado) com Idempotency-Key por item; estados Aguardando/Sincronizando/Sincronizado/Erro; reenvio ao entrar e ao voltar ao primeiro plano; a fila é apagada ao sair da conta. Antes de salvar (online) consulta duplicidade (documento, telefone, e-mail) sem bloquear, exceto mesmo CPF/CNPJ.
- .NET: `POST /api/v1/customers` (+ `/duplicates`, `/lookup/postal-code`, `/lookup/company`), permissão `people.create`; só assina e repassa ao ComercialWeb (`/api/mobile/v1/customers/*`), que aplica as regras de Pessoa, deduplica por `client_uuid` e marca `people.registration_incomplete`. A marca cai sozinha quando a pessoa fica completa (nome + documento + telefone), por qualquer caminho de gravação.
- **Ordem de deploy:** a migration do ComercialWeb (colunas `registration_incomplete`/`mobile_client_uuid`) deve ir ANTES da API .NET, pois a listagem de clientes passa a ler `registration_incomplete`.

## Tabela de preço (app → .NET → ComercialWeb)
- O ComercialWeb tem 2 tabelas (`varejo` = `sale_price`; `atacado` = `wholesale_price`, ou o desconto global de Configurações > Vendas quando o produto não tem atacado), com rótulos configuráveis por empresa. A regra é `PriceTablePrice`/`ProductPriceResolver`; o app e o .NET **não** calculam preço, só repassam a chave da tabela.
- Rotas de máquina novas: `price-tables`, `products/prices`; `price_mode` em `pre-sales` e `pdv/quote|sales` (grava `sales.price_mode`). .NET: `GET /price-tables`, `GET /products?priceTable=`, `GET /products/{id}` (traz `prices`), `POST /products/prices`, `priceTable` em pré-venda e PDV.
- App: tabela escolhida persiste (SecureStore) e é a padrão de cada operação nova; cada rascunho tem a sua (`Draft.priceTable`), sempre visível. Trocar com itens no carrinho pergunta e recalcula pelo servidor; produto sem preço na nova tabela impede a troca. Cliente com escopo de comércio "atacado" sugere Atacado (a web não faz isso).
- Divergência conhecida no ComercialWeb: o PDV web (`PdvSaleService::addItem`) usa `wholesale_price ?: sale_price` (sem o desconto global); pré-venda e `products/prices` usam o desconto global.

## Gestão (somente leitura)

Financeiro (contas a receber/pagar e resumo), Compras e Relatórios de vendas são consultas do .NET direto no banco do ComercialWeb (módulo `Management`), com as mesmas permissões da web e escopo da empresa inteira (como o dashboard). Nada é escrito: lançamentos, baixas e conferência de XML seguem no ComercialWeb. Offline não se aplica (sem escrita para enfileirar); sem conexão a tela mostra o erro com "Tentar novamente".
