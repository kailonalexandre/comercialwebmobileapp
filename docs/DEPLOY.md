# Deploy da API do app (.NET)

Estado e decisões (2026-09-30). **Nada aqui foi aplicado em servidor**: é o roteiro, com a ordem e o rollback de cada passo.

| | Produção (prod-01) | Dev |
|---|---|---|
| Plataforma | K3s 1.31, um nó, namespace `comercial-prod`, Traefik + cert-manager (`letsencrypt-prod`) | Docker Compose (`comercial-web-dev-*`) com Apache no host (80/443) |
| Domínio da API | `api.infinitsolucoesweb.com.br` (DNS já aponta para `179.199.129.130`) | `api.dev.infinitsolucoesweb.com.br` (DNS já aponta para `72.60.14.161`) |
| ComercialWeb | `https://comercial.infinitsolucoesweb.com.br` | `https://dev.infinitsolucoesweb.com.br` |
| MySQL | no host, `DB_HOST=10.8.0.1`, banco `comercial_web_prod`, porta 3306 | no host, `DB_HOST=172.16.0.1:3306`, banco `comercial_web_dev` |
| Borda / rate limit | Traefik (`Middleware` em `deploy/k8s/prod/middlewares.yaml`) | nginx (`deploy/dev/nginx-mobile-api.conf`) |
| Arquivos | `deploy/k8s/prod/`, `deploy/k8s/cluster/` | `deploy/dev/` |

Decisões de implantação: primeiro deploy com `kubectl apply` **manual**; a automação por ServiceAccount (como o `github-deployer` do ComercialWeb) fica para depois. Usuário MySQL **`mobile_api` separado** em dev e em prod, cada ambiente com os seus segredos.

Regras: **a API não limita requisições** (rate limit é da borda); **uma única réplica** (push e renovação de token são por instância); **segredos só no ambiente do servidor**, nunca no git; deploy e rollback **sempre pelo SHA completo** da imagem.

## 0. Antes de tudo
1. **GHCR (decidido):** a imagem fica em `ghcr.io/kailonalexandre/comercialweb-mobile-api:<sha>`, publicada pelo workflow `backend-image.yml` com o `GITHUB_TOKEN` do próprio repositório. O cluster usa um pull secret **próprio**, `ghcr-pull-mobile` (nunca o `ghcr-pull` do ComercialWeb): token clássico com **só** `read:packages`, de uma conta com acesso ao pacote. Depois do primeiro push, em GitHub > Packages > `comercialweb-mobile-api` > Package settings, conferir que o pacote está ligado ao repositório (herda o acesso) e, se o pull falhar com `unauthorized`, dar acesso de leitura à conta do token. Criar o secret: comando em `deploy/k8s/prod/secret.example.yaml`. Em dev (Compose): `echo <TOKEN> | docker login ghcr.io -u kailonalexandre --password-stdin` com o usuário do deploy no host (vale só para esse usuário do Docker).
2. **Commit de referência:** a imagem de um PR só é construída (valida o Dockerfile); só `dev`/`main` publicam.

## 1. MySQL (prod e dev)
1. **Descobrir de onde os pods chegam ao MySQL** (não imprime senha): `sudo mysql -e "SELECT user,host FROM mysql.user WHERE user LIKE 'comercial%'; SELECT DISTINCT SUBSTRING_INDEX(host,':',1) AS origem FROM information_schema.processlist;"`. O `host` do usuário da API precisa cobrir essa origem (em prod: pods saem pelo nó, `10.8.0.1`/`10.42.%`; em dev: `172.29.250.%`).
2. **Usuário de execução, privilégio mínimo** (substitua `<ORIGEM>` e a senha, sem repetir a do Laravel):
   ```sql
   CREATE USER 'mobile_api'@'<ORIGEM>' IDENTIFIED BY '<SENHA FORTE>';
   GRANT SELECT ON <BANCO>.* TO 'mobile_api'@'<ORIGEM>';
   GRANT INSERT, UPDATE, DELETE ON <BANCO>.mobile_sessions TO 'mobile_api'@'<ORIGEM>';
   GRANT INSERT, UPDATE, DELETE ON <BANCO>.mobile_refresh_tokens TO 'mobile_api'@'<ORIGEM>';
   GRANT INSERT, UPDATE, DELETE ON <BANCO>.mobile_push_tokens TO 'mobile_api'@'<ORIGEM>';
   GRANT INSERT ON <BANCO>.mobile_sale_origins TO 'mobile_api'@'<ORIGEM>';
   GRANT UPDATE (read_at, archived_at, updated_at) ON <BANCO>.notifications TO 'mobile_api'@'<ORIGEM>';
   ```
   As tabelas `mobile_*` precisam existir antes dos `GRANT` por tabela: rode o passo 3 primeiro com a conta de deploy (abaixo) e só então esses `GRANT`.
3. **Conta de deploy (só para o Job de migrations):** `CREATE`, `ALTER`, `INDEX`, `REFERENCES`, `SELECT`, `INSERT` em `<BANCO>.*`; nada de `DROP`, `DELETE` ou `UPDATE`. Crie-a, use no Job e **remova** depois se não for fixa.
4. **Firewall (prod):** o `ufw` já libera 3306 só para `172.16.0.0/12` e `10.8.0.0/24`; `bind_address` está em `0.0.0.0` (seguro apenas por causa do firewall). Melhoria opcional: `bind-address = 10.8.0.1,127.0.0.1`.

## 2. Segredos (criados no servidor, nunca no git)
Comandos e chaves em `deploy/k8s/prod/secret.example.yaml` (K3s) e no cabeçalho de `deploy/dev/compose.mobile-api.yaml` (Compose). São eles: conexão do MySQL (`mobile_api`), `ComercialWeb__MobileApiSecret` (**o mesmo valor** de `MOBILE_API_SECRET` no Laravel daquele ambiente, 32+ caracteres), chave EC P-256 do JWT, e a conexão da conta de deploy para o Job.

## 3. Migrations
- **Prod:** `kubectl apply -f deploy/k8s/prod/migrate-job.yaml` (com o SHA no lugar de `MOBILE_API_IMAGE_TAG`) e `kubectl -n comercial-prod logs job/mobile-api-migrate`. Esperado: `applied 0001…0004` (ou nada, se já aplicadas). O Job só roda antes de trocar a imagem da API.
- **Dev:** `docker run --rm --env-file mobile-api.env -e ASPNETCORE_ENVIRONMENT=Production -e DataProtection__KeysPath=/tmp/dp -e Jwt__SigningKeyPath=/run/jwt.pem -v ./jwt.pem:/run/jwt.pem:ro ghcr.io/<dono>/comercialweb-mobile-api:<sha> migrate`.

## 4. Subir a API
- **Prod (K3s):**
  1. Pré-requisito do rate limit por IP: `kubectl apply -f deploy/k8s/cluster/traefik-real-ip.yaml` (ver o cabeçalho do arquivo; rollback: `kubectl delete -f`). Sem isso todos os clientes dividem o mesmo IP no Traefik.
  2. `sed` do SHA e `kubectl apply -k deploy/k8s/prod` (Deployment, Middlewares, IngressRoute e Certificate).
  3. `kubectl -n comercial-prod rollout status deploy/mobile-api` e `kubectl -n comercial-prod get certificate mobile-api-tls` (deve ficar `READY=True`).
- **Dev (Compose):** `copiar deploy/dev/ para /root/Projetos/mobile-api/ (roteiro completo em DEPLOY_DEV.md)`, criar `mobile-api.env` e `jwt.pem` (chmod 600), `docker compose -p mobile-api-dev -f compose.mobile-api.yaml --env-file mobile-api.env up -d`; instalar o vhost (`apache-vhost.api-dev.conf`), `a2enmod proxy proxy_http headers`, `certbot --apache -d api.dev.infinitsolucoesweb.com.br`.

### CD do dev (automático em push para `dev`)
O job `deploy-dev` de `.github/workflows/backend-image.yml` roda depois de a imagem ser publicada: copia `deploy/dev/` para `~/mobile-api-deploy/` na VPS e executa `sudo -n env DEPLOY_AUTO=1 bash instalar-dev.sh <SHA>` (mesmo script do deploy manual; migrations incluídas). Só dispara em push para `dev` (nunca PR/`main`) e só quando `backend/**` muda. Prod continua manual.

Setup único (você faz, o repositório não guarda nenhum segredo):
1. **VPS:** usuário de deploy dedicado (não o seu) com `sudo` sem senha **só** para esse script, em `/etc/sudoers.d/mobile-deploy`: `deploy ALL=(root) NOPASSWD: /usr/bin/env DEPLOY_AUTO=1 bash /home/deploy/mobile-api-deploy/instalar-dev.sh *`. Faça `docker login ghcr.io` (token `read:packages`) uma vez como root, porque o modo automático não pede token.
2. **Chave:** `ssh-keygen -t ed25519 -f deploy_key -N ""`; a pública vai em `authorized_keys` do usuário de deploy; a privada vira o secret.
3. **GitHub → Settings → Environments → `dev-vps`:** secrets `DEV_SSH_KEY` (privada), `DEV_SSH_HOST`, `DEV_SSH_USER`, `DEV_SSH_KNOWN_HOSTS` (saída de `ssh-keyscan -t ed25519 <host>` conferida contra o fingerprint do servidor). Restrinja o environment à branch `dev`.
4. **Risco a ter em mente:** quem faz merge em `dev` executa `instalar-dev.sh` como root na VPS (o script vem do próprio commit). Mantenha `dev` protegida (PR obrigatório) e o sudoers restrito como acima.

## 5. Conferir
1. **Saúde:** `curl -s -o /dev/null -w "%{http_code}\n" https://<dominio-da-api>/health` → `200`.
2. **IP do cliente (prod):** faça uma chamada de fora e veja, nos logs do `comercial-web`, se o último campo (`X-Forwarded-For`) agora é o **seu IP público** e não `10.42.x.x`: `kubectl -n comercial-prod logs deploy/comercial-web -c nginx --tail=3`. Se ainda aparecer `10.42.x.x`, o passo 4.1 não pegou: **não siga**.
3. **Rate limit:** `for i in $(seq 1 15); do curl -s -o /dev/null -w "%{http_code} " -X POST https://<dominio-da-api>/api/v1/auth/pair -H 'Content-Type: application/json' -d '{}'; done` → os primeiros `422` e depois `429`.
4. **Pareamento ponta a ponta:** gere um QR no ComercialWeb do ambiente e pareie um aparelho com o app construído para aquele ambiente (seção 6).
5. **Logs da API:** sem `ERROR`; 503 no pareamento significa segredo ou relógio divergente entre API e ComercialWeb.

## 6. App (Play Store)
- Produção: `EXPO_PUBLIC_APP_ENV=vps EXPO_PUBLIC_API_URL=https://api.infinitsolucoesweb.com.br/api EXPO_PUBLIC_ALLOWED_SERVER_HOSTS=comercial.infinitsolucoesweb.com.br GOOGLE_SERVICES_JSON=./secrets/google-services.json npx eas-cli build --platform android --profile production` (AAB; a assinatura fica com o EAS). O pacote `br.com.infinitsolucoesweb.comercial` passa a ser definitivo depois da primeira publicação.
- Testadores/dev: perfil `preview` (também flavor vps, nunca HTTP) com `EXPO_PUBLIC_API_URL=https://api.dev.infinitsolucoesweb.com.br/api` e `EXPO_PUBLIC_ALLOWED_SERVER_HOSTS=dev.infinitsolucoesweb.com.br`.
- Push em produção: só depois de instalar a credencial (docs/PUSH_SETUP.md) e trocar `Push__Enabled` para `true`.

## 7. Rollback
- **Imagem:** `kubectl -n comercial-prod set image deploy/mobile-api api=ghcr.io/<dono>/comercialweb-mobile-api:<sha anterior>` (Compose: trocar `MOBILE_API_IMAGE_TAG` e `up -d`). As migrations só **adicionam** (expand), então a imagem anterior continua funcionando.
- **Traefik:** `kubectl delete -f deploy/k8s/cluster/traefik-real-ip.yaml`.
- **Sessões:** perder o volume de chaves (`mobile-api-keys`) derruba todas as sessões pareadas (novo QR). Faça backup do PVC junto com o do nó.

## 8. Pendências conhecidas
- O `KnownNetworks` (`10.42.0.0/16` em prod; `172.29.250.0/24` em dev) precisa continuar exato: nunca alargar.
- Uma réplica: alta disponibilidade exige lock no banco para o push e para a renovação de token.
- `http://` para o domínio da API não tem rota (sem redirecionamento): o app só usa HTTPS.
