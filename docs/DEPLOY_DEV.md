# Deploy da API na VPS de DEV — passo a passo (Docker Compose)

Valores reais de dev: API `https://api.dev.infinitsolucoesweb.com.br`, ComercialWeb `https://dev.infinitsolucoesweb.com.br`,
MySQL no host `172.16.0.1:3306`, banco `comercial_web_dev`, imagem `ghcr.io/kailonalexandre/comercialweb-mobile-api`,
sub-rede da API `172.29.250.0/24` (fixa no Compose). Contexto e regras: [DEPLOY.md](DEPLOY.md). **Nunca cole senhas no chat.**

## Regra de ouro
**Não instalar nem alterar nada que não seja do app mobile.** Este roteiro só cria, e nada mais:
- a pasta `/srv/mobile-api-dev` e um projeto Compose próprio (`mobile-api-dev`: 2 containers, 1 rede `172.29.250.0/24`, 1 volume);
- 2 usuários MySQL (`mobile_api`, e `mobile_deploy` que é apagado no fim) e as tabelas `mobile_*` no banco de dev;
- 1 vhost do Apache (`api-dev`) e 1 certificado para `api.dev.infinitsolucoesweb.com.br`;
- 1 regra de firewall (MySQL só para a sub-rede da API), se o `ufw` estiver ativo.

Não toca no ComercialWeb, no blue/green dele, nos outros sites e containers da VPS, nem no `certbot` (já instalado). Se o mapeamento abaixo mostrar que algo **do mobile** falta (por exemplo um módulo do Apache), instala-se só isso, com aviso antes; nada além.

## Passo zero: mapear a VPS (somente leitura)
```bash
scp deploy/dev/mapear-vps.sh <USUARIO>@72.60.14.161:/tmp/
ssh <USUARIO>@72.60.14.161 'bash /tmp/mapear-vps.sh 2>&1 | tee /tmp/mapa-vps.txt'
```
O script não instala, não cria e não altera nada, e não imprime segredos. Confere: sistema e disco, ferramentas, containers, redes (**conflito com `172.29.250.0/24`**), portas (80, 443, 3306, **8088 livre**), Apache (módulos e sites), certificados, DNS da API, firewall, MySQL (bind, usuários, bancos) e se o ComercialWeb de dev tem o `MOBILE_API_SECRET` e a rota do pareamento. **Só siga para o passo 0 depois de conferir a saída.**

## 0. Da sua máquina: copiar os 3 arquivos (não precisa clonar o repositório na VPS)
```bash
cd ~/Documents/ComercialWebMobile
scp deploy/dev/compose.mobile-api.yaml deploy/dev/nginx-mobile-api.conf deploy/dev/apache-vhost.api-dev.conf <USUARIO>@72.60.14.161:/tmp/
```

## 1. Na VPS de dev: pasta e checagens
```bash
sudo mkdir -p /srv/mobile-api-dev && sudo chown "$USER" /srv/mobile-api-dev
mv /tmp/compose.mobile-api.yaml /tmp/nginx-mobile-api.conf /tmp/apache-vhost.api-dev.conf /srv/mobile-api-dev/
cd /srv/mobile-api-dev
docker compose version | head -1
```
(Já mapeado no passo zero: `8088` livre, sem conflito de rede, `certbot` presente.)

## 2. Imagem (token `read:packages`)
```bash
read -rsp "Token read:packages: " GHCR_TOKEN; echo
echo "$GHCR_TOKEN" | docker login ghcr.io -u kailonalexandre --password-stdin; unset GHCR_TOKEN
IMG=bbf2af9b75f398700e7dc505a9e6d9b7857abbf4
docker pull ghcr.io/kailonalexandre/comercialweb-mobile-api:$IMG | tail -2
```
`unauthorized` = o pacote não está ligado ao repositório ou o token não tem acesso (GitHub > Packages > Package settings).

## 3. Segredos locais da API
```bash
# Chave do JWT (EC P-256). Dono = UID do container (1654); ninguém mais lê.
openssl ecparam -name prime256v1 -genkey -noout -out jwt.pem
sudo chown 1654:1654 jwt.pem && sudo chmod 400 jwt.pem

# Volume das chaves do Data Protection, com dono do container
docker volume create mobile-api-dev_mobile_api_keys >/dev/null
docker run --rm -v mobile-api-dev_mobile_api_keys:/keys alpine chown -R 1654:1654 /keys

# Variáveis (senhas geradas aqui; nada é impresso)
BANCO=comercial_web_dev
DEPLOY_PW=$(openssl rand -hex 24); API_PW=$(openssl rand -hex 24)
MSECRET=$(docker exec comercial-web-dev-app_blue-1 printenv MOBILE_API_SECRET)
[ "${#MSECRET}" -ge 32 ] && echo "MOBILE_API_SECRET ok (${#MSECRET} caracteres)" || echo "ATENÇÃO: MOBILE_API_SECRET ausente ou curto no ComercialWeb de dev"
```
Se aparecer a atenção: defina `MOBILE_API_SECRET` (32+ caracteres) no ambiente do ComercialWeb de dev, reinicie-o e refaça só este bloco. O valor tem de ser **o mesmo** dos dois lados.

## 4. Arquivo de ambiente da API (fora do git, só você lê)
```bash
umask 077
cat > mobile-api.env <<EOT
MOBILE_API_IMAGE_TAG=${IMG}
ConnectionStrings__ComercialWeb=Server=172.16.0.1;Port=3306;User ID=mobile_api;Password=${API_PW};Database=${BANCO}
ComercialWeb__MobileApiSecret=${MSECRET}
EOT
```

## 5. MySQL: conta de deploy, migrations, depois `mobile_api`
```bash
# 5a. contas (hosts = sub-rede da API no Compose)
sudo mysql <<SQL
CREATE USER IF NOT EXISTS 'mobile_deploy'@'172.29.250.%' IDENTIFIED BY '${DEPLOY_PW}';
GRANT SELECT, INSERT, CREATE, ALTER, INDEX, REFERENCES ON ${BANCO}.* TO 'mobile_deploy'@'172.29.250.%';
CREATE USER IF NOT EXISTS 'mobile_api'@'172.29.250.%' IDENTIFIED BY '${API_PW}';
SQL

# 5b. firewall (só se o ufw estiver ativo): MySQL só para a sub-rede da API
sudo ufw allow from 172.29.250.0/24 to any port 3306 proto tcp

# 5c. migrations com a conta de deploy (esperado: applied 0001 ... 0004)
docker compose -p mobile-api-dev -f compose.mobile-api.yaml --env-file mobile-api.env run --rm --no-deps \
  -e "ConnectionStrings__ComercialWeb=Server=172.16.0.1;Port=3306;User ID=mobile_deploy;Password=${DEPLOY_PW};Database=${BANCO}" \
  mobile-api migrate

# 5d. privilégios mínimos do mobile_api (as tabelas já existem)
sudo mysql <<SQL
GRANT SELECT ON ${BANCO}.* TO 'mobile_api'@'172.29.250.%';
GRANT INSERT, UPDATE, DELETE ON ${BANCO}.mobile_sessions TO 'mobile_api'@'172.29.250.%';
GRANT INSERT, UPDATE, DELETE ON ${BANCO}.mobile_refresh_tokens TO 'mobile_api'@'172.29.250.%';
GRANT INSERT, UPDATE, DELETE ON ${BANCO}.mobile_push_tokens TO 'mobile_api'@'172.29.250.%';
GRANT INSERT ON ${BANCO}.mobile_sale_origins TO 'mobile_api'@'172.29.250.%';
GRANT UPDATE (read_at, archived_at, updated_at) ON ${BANCO}.notifications TO 'mobile_api'@'172.29.250.%';
-- a conta de deploy só existe durante o deploy:
DROP USER IF EXISTS 'mobile_deploy'@'172.29.250.%';
SQL
unset DEPLOY_PW API_PW MSECRET
```
Se o 5c der `Access denied` ou `Unable to connect`: o MySQL não escuta em `172.16.0.1` (`sudo ss -ltnp | grep 3306`) ou o firewall bloqueia. Mande a saída.

## 6. Subir a API e a borda (nginx com rate limit)
```bash
docker compose -p mobile-api-dev -f compose.mobile-api.yaml --env-file mobile-api.env up -d
sleep 15
docker compose -p mobile-api-dev -f compose.mobile-api.yaml ps
curl -s -o /dev/null -w "saude local: %{http_code}\n" http://127.0.0.1:8088/health
docker compose -p mobile-api-dev -f compose.mobile-api.yaml logs --tail=20 mobile-api
```
Esperado: `saude local: 200` e o log sem `fail:`/`ERROR`.

## 7. Apache (TLS) e certificado
```bash
sudo cp apache-vhost.api-dev.conf /etc/apache2/sites-available/api-dev.conf
sudo a2enmod proxy proxy_http headers     # só os que o mapeamento mostrar como desabilitados; habilitar módulo não instala pacote
sudo a2ensite api-dev && sudo apache2ctl configtest && sudo systemctl reload apache2
sudo certbot --apache -d api.dev.infinitsolucoesweb.com.br     # certbot já instalado na VPS
```

## 8. Conferir
```bash
curl -s -o /dev/null -w "saude https: %{http_code}\n" https://api.dev.infinitsolucoesweb.com.br/health
# assinatura + segredo ponta a ponta com o ComercialWeb de dev: 422 = ok (503 = segredo/relógio divergente)
curl -s -o /dev/null -w "pair falso: %{http_code}\n" -X POST https://api.dev.infinitsolucoesweb.com.br/api/v1/auth/pair \
  -H 'Content-Type: application/json' -d "{\"code\":\"$(printf 'a%.0s' $(seq 60))\"}"
# rate limit da borda: os primeiros 422, depois 429
for i in $(seq 1 18); do curl -s -o /dev/null -w "%{http_code} " -X POST https://api.dev.infinitsolucoesweb.com.br/api/v1/auth/pair -H 'Content-Type: application/json' -d '{}'; done; echo
```

## 9. Rollback / atualizar
- **Atualizar:** troque `MOBILE_API_IMAGE_TAG` no `mobile-api.env` pelo novo SHA completo, `docker pull`, rode o 5c de novo (migrations novas) e `docker compose ... up -d`.
- **Voltar:** `MOBILE_API_IMAGE_TAG` com o SHA anterior + `up -d` (as migrations só adicionam).
- **Desligar:** `docker compose -p mobile-api-dev -f compose.mobile-api.yaml down` (o volume das chaves fica; apagá-lo derruba as sessões pareadas).
