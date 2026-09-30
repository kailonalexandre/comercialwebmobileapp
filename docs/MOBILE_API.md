# API do ComercialWeb Mobile (`/api/mobile/v1`)

Contrato entre o **ComercialWeb** (fonte da verdade) e o aplicativo **ComercialWeb Mobile**
(`comercialwebmobileapp`). O app nunca fala com o MySQL: só HTTPS + Bearer.

- **Base URL:** o host que vem no QR (`server`), ex.: `https://cliente.exemplo.com.br`. Todas as rotas abaixo são relativas a `{server}/api/mobile/v1`.
- **Só HTTPS.** O app não deve aceitar `http://` nem certificado inválido.
- **Formato:** JSON. Envie sempre `Accept: application/json`. Valores monetários em **centavos** (`*_cents`), quantidades de estoque em **milésimos** (`*_milli`), datas ISO 8601.
- **Cabeçalho opcional:** `X-Mobile-App-Version: 1.0.0` (registrado no aparelho, só diagnóstico).
- **Empresa e unidade** vêm do aparelho pareado. **Nenhum** parâmetro (`business_id`, `company_id`, header) escolhe tenant; se enviado, é ignorado. Recurso de outra empresa responde `404`, igual a um id inexistente.

Este documento nunca contém segredos reais; `<...>` é sempre um valor a preencher.

---

## 1. Fluxo do QR

1. No web, usuário com `mobile.devices.manage`: **Configurações → Aplicativo Mobile → Gerar QR Code**.
2. O QR contém apenas: `comercialweb://pair?code=<60 caracteres>&server=<https://host>`.
   O `code` é aleatório, de **uso único** e vale **2 minutos**; o servidor guarda só o digest SHA-256. Gerar outro QR invalida o anterior.
3. O app lê o QR, chama `POST /pair` (abaixo) e guarda `access_token` e `refresh_token` em armazenamento seguro (Keychain / Keystore). **Descarte o `code`.**
4. O `code` **não autentica** nenhuma outra rota. Toda requisição usa `Authorization: Bearer <access_token>`.

Tokens: `access_token` vale **30 minutos**; `refresh_token` vale **60 dias** e **gira a cada uso** (o par antigo deixa de existir).
Formato dos tokens: 60 caracteres alfanuméricos opacos (não são JWT; não tente decodificá-los).

## 2. Erros

Erros de credencial: `{ "error": { "code": "...", "message": "..." } }`, sempre com `Cache-Control: no-store`.
Erros de validação: o padrão Laravel `{ "message": "...", "errors": { "campo": ["..."] } }`.

| HTTP | Significado | Ação do app |
| --- | --- | --- |
| 401 `mobile_token_expired` | access token expirou (só vem com token autêntico) | chamar `/auth/refresh` e repetir a requisição |
| 401 `mobile_token_missing` / `mobile_unauthorized` | sem token, inválido, aparelho revogado, usuário/empresa/unidade fora do ar | voltar à tela de conectar (novo QR) |
| 401 `mobile_refresh_invalid` | refresh inválido, já usado, expirado ou aparelho revogado | voltar à tela de conectar |
| 403 | sem permissão (`mobile.access` ou a do recurso) | ocultar/avisar; não é caso de reconectar |
| 404 | inexistente **ou de outra empresa** | tratar como "não encontrado" |
| 409 | conflito de negócio (reservado para escrita) | mostrar a mensagem |
| 422 | validação (`invalid_pairing_code`, `invalid_cursor`, campos) | corrigir a entrada |
| 429 | rate limit; cabeçalho `Retry-After` | esperar e repetir |
| 5xx | erro inesperado; sem detalhes internos | repetir com backoff |

Concorrência de refresh: se duas requisições receberem `mobile_token_expired`, faça **um** refresh só (fila no app). Um segundo refresh com o mesmo `refresh_token` falha com 401.

## 3. Paginação

Listas: `?page=1&per_page=20` (máx. 50). Resposta: `{ "data": [...], "meta": { "page", "per_page", "total", "last_page" } }`.

## 4. Rate limits

| Rota | Limite |
| --- | --- |
| `POST /pair` | 10/min por IP do cliente final (`X-Mobile-Client-Ip`, só se a requisição for assinada), teto de 600/min por servidor |
| `POST /auth/refresh` | 30/min por IP |
| demais (autenticadas) | 120/min |
| `GET /sync` | 60/min |
| web: gerar QR | 6/min por usuário |

---

## 5. Endpoints

Legenda: AUTH = `Bearer` (access token) salvo indicação. Todas as rotas autenticadas exigem a permissão `mobile.access` **além** da listada.

### POST /pair
- **AUTH:** assinatura de máquina do .NET (`X-Mobile-Timestamp`, `X-Mobile-Signature`: HMAC-SHA256 de `{timestamp}\nPOST\n/api/mobile/v1/pair\n{corpo}` com `MOBILE_API_SECRET`, janela de 5 min); sem ela, 401. O `code` é a credencial de uso único.
- **HEADER opcional:** `X-Mobile-Client-Ip` = IP do aparelho que chamou o .NET. Só vale com assinatura válida e define o balde do rate limit.
- **PERMISSIONS:** o usuário que gerou o QR precisa ter `mobile.access`
- **REQUEST:** `{ "code": "<60 chars>", "device_name": "Galaxy S24", "platform": "android|ios|other", "app_version": "1.0.0" }`
  (`device_name` é o que aparece no painel; use o nome do aparelho informado pelo usuário/SO. Sem fingerprint.)
- **RESPONSE 201:**
  ```json
  { "token_type": "Bearer", "access_token": "<60>", "expires_in": 1800,
    "refresh_token": "<60>", "device": { "id": "<uuid>", "name": "Galaxy S24" } }
  ```
- **ERRORS:** 422 `invalid_pairing_code` (inexistente, expirado, já usado ou usuário/empresa sem acesso: mesma resposta); 422 validação; 429.

### POST /auth/refresh
- **AUTH:** nenhum (o `refresh_token` é a credencial)
- **REQUEST:** `{ "refresh_token": "<60>" }`
- **RESPONSE 200:** igual ao de `/pair` (par novo; **substitua ambos**).
- **ERRORS:** 401 `mobile_refresh_invalid`; 422; 429.

### POST /auth/logout
- **AUTH:** Bearer. **PERMISSIONS:** `mobile.access`
- **RESPONSE:** 204. O aparelho é revogado; o refresh também deixa de valer.

### GET /bootstrap
- **AUTH:** Bearer. **PERMISSIONS:** `mobile.access`
- **RESPONSE 200:**
  ```json
  { "user": { "id", "name", "email" }, "business": { "id", "name" }, "unit": { "id", "name" } | null,
    "device": { "id", "name" },
    "permissions": ["sales.view", "products.view", "people.view", "inventory.view", "loja-virtual.access", "marketplaces.view"],
    "dashboard": { "sales_today_count", "sales_today_total_cents", "unread_notifications" },
    "api": { "version": "v1", "min_app_version": "1.0.0" }, "server_time": "..." }
  ```
  `permissions` só lista as que o app usa para mostrar/ocultar áreas (subconjunto das concedidas). `sales_today_*` é `null` sem `sales.view`. Se a versão do app for menor que `min_app_version`, peça atualização.
- **ERRORS:** 401.

### GET /sales
- **PERMISSIONS:** `sales.view`
- **REQUEST (query):** `page`, `per_page`, `search` (número/cliente), `status`, `date_from`, `date_to` (`Y-m-d`)
- **RESPONSE:** lista paginada de `{ id, number, status, origin, occurred_at, customer:{id,name,document}|null, seller, subtotal_cents, discount_cents, freight_cents, total_cents, updated_at, deleted_at }`. Só a **unidade do aparelho**.
- **ERRORS:** 401, 403, 422.

### GET /sales/{id}
- **PERMISSIONS:** `sales.view`. **RESPONSE:** o objeto acima + `observation`, `items[]` (`product_id, description, quantity, unit_price_cents, discount_cents, total_cents`), `payments[]` (`method, amount_cents, installments`).
- **ERRORS:** 404 (inexistente, de outra empresa ou de outra unidade).

### GET /orders
- **PERMISSIONS:** `loja-virtual.access` ou `marketplaces.view`
- **REQUEST:** `page`, `per_page`, `source` (`all|store|mercadolivre`), `status`, `search`
- **RESPONSE:** `{ "data": [ { "channel": "store|mercadolivre", "failure": null|"msg", "meta": {paginação}|null, "items": [ { id, number, customer, total_cents, status, payment, delivery, requires_attention, created_at, updated_at } ] } ] }`. Uma seção por canal (paginação independente); `failure` preenchido = a fonte externa estava indisponível.
- É o mesmo Monitor de Pedidos do web (regras e status idênticos).

### GET /orders/marketplace/{id}
- **PERMISSIONS:** `marketplaces.view`. **RESPONSE:** `{ id, channel, external_order_id, status, external_status, total_cents, buyer_name, placed_at, items[] }`.
- **ERRORS:** 404. *Detalhe de pedido da Loja Virtual ainda não existe na API.*

### GET /products
- **PERMISSIONS:** `products.view`
- **REQUEST:** `page`, `per_page`, `search`, `include_inactive`, `sort` (`name|code|sale_price|updated_at`), `direction`
- **RESPONSE:** lista paginada de `{ id, code, sku, name, barcode, unit, sale_price_cents, is_active, stock_quantity_milli, updated_at }`. `stock_quantity_milli` = saldo da unidade do aparelho.

### GET /products/{id}
- **PERMISSIONS:** `products.view`. **RESPONSE:** `{ "data": <produto> }`. **ERRORS:** 404.

### GET /products/{id}/stock
- **PERMISSIONS:** `products.view` ou `inventory.view`
- **RESPONSE:** `{ "data": { product_id, unit_id, total_milli, balances: [ { variation_id|null, storage_location_id, quantity_milli } ] } }` (unidade do aparelho).
- **ERRORS:** 404.

### GET /customers
- **PERMISSIONS:** `people.view`. **REQUEST:** `page`, `per_page`, `search`.
- **RESPONSE:** lista paginada de `{ id, code, name, trade_name, document, phone, is_active }` (só clientes ativos).

### GET /notifications
- **PERMISSIONS:** `mobile.access`. **REQUEST:** `page`, `per_page`, `read` (`read|unread`).
- **RESPONSE:** `{ data: [ { id, type, severity, title, body, read, created_at } ], meta, unread }`. É o mesmo armazenamento do sino do web (usuário + empresa do aparelho).

### GET /sync
Sincronização incremental. **Não baixe tabelas inteiras repetidamente.**
- **PERMISSIONS:** por recurso: `products`→`products.view`, `customers`→`people.view`, `stock`→`inventory.view`, `sales`→`sales.view`.
- **REQUEST:** `resource` (`products|customers|stock|sales`), `cursor` (opaco; omita na primeira carga), `limit` (1–500, padrão 200)
- **RESPONSE:** `{ "resource", "data": [...], "next_cursor": "<opaco>"|null, "has_more": bool, "server_time" }`
- **ERRORS:** 401, 403, 422 `invalid_cursor` / validação, 429.

Como usar (um cursor **por recurso**):
```
cursor = cursorSalvo(resource)              # null na primeira vez
loop:
  r = GET /sync?resource=R&cursor=cursor&limit=200
  BEGIN; aplicar r.data no banco local; salvar r.next_cursor (se não null); COMMIT   # nunca o contrário
  cursor = r.next_cursor
  se !r.has_more: fim
```
Regras:
1. O cursor é `(updated_at, id)` gerado pelo servidor; **nunca** monte um com o relógio do celular. Trate como string opaca.
2. `has_more = true` pode significar "acabou agora"; uma página vazia a mais é normal. Página vazia devolve o mesmo cursor.
3. **Exclusão:** `sales` e `customers` chegam com `deleted_at` preenchido (apague localmente). `products`: `is_active=false` significa fora de circulação. `stock` é snapshot por `(product_id, variation_key, storage_location_id)`; saldo zero é dado válido.
4. O formato dos itens de `products`, `customers` (recurso `people` do PDV: traz `types`) e `stock` é o mesmo do PDV Offline (`docs/development/PDV_TERMINAL_API.md`, seção *pull*). `sales` usa o objeto de `GET /sales` (sem itens; busque o detalhe sob demanda).
5. Cursor inválido (422): descarte-o e recomece do zero.

---

## 6. Tempo real e push

Não há WebSocket/broadcasting no ComercialWeb, e não foi introduzido. Estratégia:
- **Em primeiro plano:** consulte `GET /sync` (recursos de interesse) e `GET /notifications` a cada 30–60 s, respeitando o rate limit; use `dashboard.unread_notifications` do `/bootstrap` como sinal barato.
- **Em segundo plano:** push (FCM/APNs) é uma etapa futura. A tabela `mobile_devices` já identifica cada aparelho; o token de push será uma coluna nova + envio pelo módulo de Notificações existente, sem mudar este contrato. Até lá, o app só recebe eventos quando aberto.

## 7. Rotas de máquina (.NET → ComercialWeb): venda, desconto e comprovante

Rotas **assinadas**, não usam Bearer: o .NET assina `{timestamp}\n{MÉTODO}\n{/caminho}\n{corpo}` com HMAC-SHA256 (`MOBILE_API_SECRET`) em `X-Mobile-Signature` (hex) e `X-Mobile-Timestamp` (unix, janela de 5 min). Todas são `POST`, com `user_id` e `business_id` **no corpo assinado**. Sem segredo configurado ou com assinatura inválida: `401 unauthenticated`. Limite: 120/min.

Envelope de erro: `{ "success": false, "error": { "code", "message", ...contexto } }`. `message` é para mostrar ao operador.

| Rota | O que faz | Sucesso |
| --- | --- | --- |
| `POST /pre-sales` | grava pré-venda (`client_sale_uuid` idempotente) | 201 (200 se `already_existed`) |
| `POST /pdv/payment-methods` | formas de pagamento liberadas | 200 |
| `POST /pdv/quote` | total real sem gravar | 200 |
| `POST /pdv/sales` | venda finalizada com pagamento (`client_sale_uuid` idempotente) | 201 (200 se `already_existed`) |
| `POST /sales/{sale}/receipt/whatsapp` | enfileira o comprovante no WhatsApp da empresa | 202 |
| `POST /sales/{sale}/receipt/pdf` | devolve o PDF do comprovante | 200 `application/pdf` |

Preço, total e desconto são **sempre recalculados no servidor**; o app só envia a intenção.

### Desconto (`/pre-sales`, `/pdv/quote`, `/pdv/sales`)

Todos os campos são opcionais; sem eles nada muda.

- Por item, em `items[]`: `discount_percent` (0–99,99, até 2 casas, ex.: `10.5`) **ou** `discount_cents` (inteiro, centavos).
- Na venda: `sale_discount_percent` (0–99,99, 2 casas) **ou** `sale_discount_cents`.
- Enviar os dois do mesmo par (mesmo com zero) → `422` de validação Laravel (`errors.items.N.discount_percent` / `errors.sale_discount_percent`). Desconto `0` é aceito e não faz nada.
- `/pdv/quote` devolve `total_cents` e `discount_cents` já com o desconto (e `items[].discount_cents`). O limite do cliente também é checado na cotação.

| HTTP | `error.code` | Quando |
| --- | --- | --- |
| 422 | `discount_limit_exceeded` | desconto acima do teto do cliente (`discount_limit`) e usuário sem `sales.override-discount-limit`. Só vale com cliente informado. |
| 422 | `business_rule` | demais recusas: sem `pdv.discount` (PDV), desconto que zera o item/venda, "desconto sobre o total" desligado (pré-venda), cliente bloqueado, estoque… |
| 422 | `cash_register_closed`, `payment_incomplete`, `payment_method_not_allowed` | PDV, como antes |
| 403 | `forbidden` | usuário/empresa/permissão (`sales.access`+`sales.create` na pré-venda; `pdv.access` no PDV) |

Permissões: no PDV, desconto exige `pdv.discount`; na pré-venda vale o que a tela web exige.

### Comprovante: `POST /sales/{sale}/receipt/whatsapp`

- **Corpo:** `{ "user_id", "business_id", "phone"? }`. `phone` opcional envia a outro número (validado como WhatsApp brasileiro com DDD; inválido → 422 de validação em `phone`). Sem ele, vai ao telefone do cliente (whatsapp → celular → telefone).
- Mesmo `SaleReceiptWhatsAppService` e template da empresa da rota web `comercial/vendas/{sale}/comprovante/whatsapp`.
- **Exige:** venda da `business_id` do corpo, uma das permissões `sales.view`, `sales.access` ou `pdv.access`, módulo WhatsApp liberado para a empresa e conexão WhatsApp (Baileys) conectada.
- **Idempotência:** chave `sale:{id}:receipt-pdf` (reenviar não duplica). Com `phone`, a chave leva `:to:{número}`, então outro número envia de novo.

| HTTP | Resposta |
| --- | --- |
| 202 | `{ "success": true, "message": "..." }` na fila |
| 422 | `reason: "connection_missing"` (+ `error.code`): WhatsApp não conectado |
| 422 | `reason: "customer_phone_missing"` (+ `error.code`): cliente sem telefone válido; reenvie com `phone` |
| 422 | `error.code: business_rule`: demais recusas (ex.: template inválido) |
| 403 | `forbidden`: usuário/empresa/permissão/módulo |
| 404 | `not_found`: venda inexistente **ou de outra empresa** |

### Comprovante em PDF: `POST /sales/{sale}/receipt/pdf`

Corpo `{ "user_id", "business_id" }`. Devolve o binário `application/pdf` (`Content-Disposition: attachment; filename="comprovante-{numero}.pdf"`), o mesmo PDF enviado por WhatsApp, para o app compartilhar por outros apps. Mesmas checagens de empresa/permissão (não exige o módulo WhatsApp); 403 e 404 como acima. O .NET deve repassar o binário ao app sem reserializar.

## 8. Escrita e idempotência

As rotas de escrita da seção 7 chamam os mesmos services do web e usam `client_sale_uuid` (`UNIQUE(business_id, client_sale_uuid)`): o app gera o UUID **uma vez** por operação e o reutiliza em toda retentativa (`200 already_existed` em vez de duplicar). Preço, total, desconto, imposto e estoque são sempre recalculados no servidor. As rotas Bearer (seções anteriores) continuam somente leitura.

## 9. Compatibilidade

O contrato pertence ao prefixo `v1`. Campos novos podem ser **adicionados** a respostas existentes: ignore o que não conhecer. Mudança incompatível vira `v2` convivendo com `v1` até o último app migrar.
