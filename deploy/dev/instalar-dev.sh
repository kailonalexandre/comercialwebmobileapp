#!/usr/bin/env bash
# Instala/atualiza a API do app mobile na VPS de DEV (Docker Compose + Apache + MySQL do host).
#
# SÓ mexe no que é do mobile: /root/Projetos/mobile-api, projeto Compose `mobile-api-dev`, usuários MySQL mobile_*, tabelas
# mobile_*, vhost `api-dev` do Apache, certificado de api.dev.infinitsolucoesweb.com.br e 1 regra de firewall (MySQL só para a
# sub-rede da API). Não instala pacotes. Não toca no ComercialWeb, nos outros containers nem nos outros sites.
# Pode rodar de novo (idempotente). Nunca imprime senhas.
#
#   bash instalar-dev.sh --verificar            só confere tudo, NÃO altera nada
#   bash instalar-dev.sh <SHA_COMPLETO_DA_IMAGEM>   confere e instala (pede confirmação)
#
# Rode com o usuário que opera o Docker na VPS (precisa de sudo para mysql, apache, certbot e ufw).
set -euo pipefail

DOMINIO=api.dev.infinitsolucoesweb.com.br
CW_DEV=https://dev.infinitsolucoesweb.com.br
BANCO=comercial_web_dev
MYSQL_HOST_DOCKER=172.16.0.1
SUBREDE=172.29.250.0/24
ALVO=/root/Projetos/mobile-api
PROJ=mobile-api-dev
IMAGEM=ghcr.io/kailonalexandre/comercialweb-mobile-api
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

MODO=instalar; IMG=""
case "${1:-}" in --verificar) MODO=verificar ;; "") echo "Uso: $0 --verificar | $0 <SHA completo da imagem>"; exit 2 ;; *) IMG="$1" ;; esac
[ "$MODO" = instalar ] && [[ "$IMG" =~ ^[0-9a-f]{40}$ ]] || [ "$MODO" = verificar ] || { echo "ERRO: informe o SHA COMPLETO (40 caracteres hexadecimais) do commit da imagem."; exit 2; }

ok() { printf '  \033[32mOK\033[0m    %s\n' "$*"; }
aviso() { printf '  \033[33mAVISO\033[0m %s\n' "$*"; }
falha() { printf '  \033[31mFALHA\033[0m %s\n' "$*"; FALHOU=1; }
FALHOU=0
# Segredo do app no ComercialWeb de dev: variável de ambiente ou, se ausente, .env.production/.env dentro do container (Laravel lê os dois).
cw_secret() {
  local v; v=$(docker exec "$CW" printenv MOBILE_API_SECRET 2>/dev/null | tr -d '\n\r')
  [ -n "$v" ] || v=$(docker exec "$CW" sh -c 'grep -h "^MOBILE_API_SECRET=" .env.production .env 2>/dev/null | tail -1' | cut -d= -f2- | tr -d "\"' \n\r")
  printf '%s' "$v"
}
compose() { docker compose -p "$PROJ" -f "$ALVO/compose.mobile-api.yaml" --env-file "$ALVO/mobile-api.env" "$@"; }

echo "== 1. Verificações (nada é alterado) =="
if sudo -n true 2>/dev/null || sudo -v 2>/dev/null; then TEM_SUDO=1; else TEM_SUDO=0; if [ "$MODO" = verificar ]; then aviso "sem sudo para este usuário: checagens de MySQL e firewall puladas (a instalação exige root/sudo)"; else falha "sudo indisponível: rode como root ou como usuário com sudo"; exit 1; fi; fi
for c in docker openssl curl certbot apache2ctl mysql; do command -v "$c" >/dev/null && ok "$c presente" || falha "$c ausente (este script NÃO instala nada: resolva antes)"; done
docker compose version >/dev/null 2>&1 && ok "docker compose presente" || falha "plugin docker compose ausente"
for f in compose.mobile-api.yaml nginx-mobile-api.conf apache-vhost.api-dev.conf; do [ -f "$AQUI/$f" ] && ok "arquivo $f" || falha "arquivo $f não está ao lado do script"; done

# sub-rede da API livre (só a nossa rede pode usá-la)
USO=$(for n in $(docker network ls -q); do docker network inspect "$n" --format '{{.Name}} {{range .IPAM.Config}}{{.Subnet}} {{end}}'; done | grep -F "172.29.250." | grep -v "^${PROJ}_mobile " || true)
[ -z "$USO" ] && ok "sub-rede $SUBREDE livre" || falha "sub-rede $SUBREDE já usada por: $USO"

# porta 8088 livre ou já é nossa
if ss -ltn | grep -q ':8088 '; then docker ps --format '{{.Names}} {{.Ports}}' | grep -q "^${PROJ}-mobile-api-edge.*8088" && ok "porta 8088 já é do nosso nginx" || falha "porta 8088 ocupada por outro processo"; else ok "porta 8088 livre"; fi

# MySQL
[ "$TEM_SUDO" = 1 ] && { sudo mysql -N -e "SELECT 1" >/dev/null 2>&1 && ok "sudo mysql funciona" || falha "sudo mysql não funciona"; } || true
[ "$TEM_SUDO" = 1 ] && { sudo mysql -N -e "SELECT schema_name FROM information_schema.schemata WHERE schema_name='$BANCO'" 2>/dev/null | grep -qx "$BANCO" && ok "banco $BANCO existe" || falha "banco $BANCO não existe"; } || true
ss -ltn | awk '{print $4}' | grep -qE "^(172\.16\.0\.1|0\.0\.0\.0|\*):3306$" && ok "MySQL escuta em $MYSQL_HOST_DOCKER (ou em todas)" || falha "MySQL não escuta em $MYSQL_HOST_DOCKER:3306"

# ComercialWeb de dev e o segredo do app (só o tamanho)
CW=$(docker ps --format '{{.Names}}' | grep -m1 -E '^comercial-web-dev-app_' || true)
if [ -n "$CW" ]; then
  N=$(cw_secret | wc -c)
  [ "$N" -ge 32 ] && ok "ComercialWeb de dev ($CW): MOBILE_API_SECRET com $N caracteres" || falha "MOBILE_API_SECRET ausente/curto ($N) no ComercialWeb de dev: defina 32+ caracteres no ambiente dele antes"
else falha "container comercial-web-dev-app_* não encontrado"; fi

# DNS, Apache, firewall, certificado
MEU=$(curl -4 -s -m 6 https://ifconfig.me || true); DNS=$(dig +short "$DOMINIO" 2>/dev/null | tail -1)
[ -n "$DNS" ] && [ "$DNS" = "$MEU" ] && ok "DNS $DOMINIO -> $DNS (este servidor)" || aviso "DNS $DOMINIO -> '${DNS:-nada}' mas o IP público é '${MEU:-?}': o certificado pode falhar"
[ -f "/etc/apache2/sites-enabled/api-dev.conf" ] && ok "vhost api-dev já habilitado (será atualizado)" || ok "vhost api-dev ainda não existe (será criado)"
for m in proxy proxy_http headers; do apache2ctl -M 2>/dev/null | grep -q " ${m}_module" && ok "módulo Apache $m ativo" || aviso "módulo Apache $m desativado: será HABILITADO (não instala pacote)"; done
[ "$TEM_SUDO" = 1 ] && { sudo ufw status 2>/dev/null | grep -q "Status: active" && ok "ufw ativo: entra 1 regra (MySQL só para $SUBREDE)" || ok "ufw inativo: nenhuma regra será criada"; } || true

if [ "$FALHOU" = 1 ]; then echo; echo "Há FALHAS acima. Nada foi alterado. Resolva e rode de novo."; exit 1; fi
[ "$MODO" = verificar ] && { echo; echo "Tudo certo. Para instalar: bash $0 <SHA completo da imagem>"; exit 0; }

echo; echo "== 2. O que este script VAI criar/alterar =="
cat <<TXT
  - pasta $ALVO (arquivos do app, jwt.pem e mobile-api.env, tudo chmod restrito)
  - imagem $IMAGEM:$IMG (docker pull; pede o token read:packages se ainda não houver login no ghcr.io)
  - projeto Compose $PROJ (2 containers, rede $SUBREDE, 1 volume)
  - MySQL ($BANCO): tabelas mobile_*, usuário mobile_api (mínimo privilégio) e mobile_deploy (apagado no fim)
  - Apache: vhost api-dev + certificado de $DOMINIO (certbot já instalado)
  Nada mais. Não toca no ComercialWeb, em outros containers nem em outros sites.
TXT
read -r -p "Digite SIM para continuar: " R; [ "$R" = SIM ] || { echo "Cancelado. Nada foi alterado."; exit 0; }

echo; echo "== 3. Instalando =="
mkdir -p "$ALVO"; cp "$AQUI"/compose.mobile-api.yaml "$AQUI"/nginx-mobile-api.conf "$AQUI"/apache-vhost.api-dev.conf "$ALVO"/
ok "arquivos em $ALVO"

# imagem
if ! docker pull "$IMAGEM:$IMG" >/dev/null 2>&1; then
  echo "  Preciso de login no ghcr.io (token clássico SÓ com read:packages)."
  read -r -s -p "  Token: " T; echo; printf '%s' "$T" | docker login ghcr.io -u kailonalexandre --password-stdin >/dev/null; unset T
  docker pull "$IMAGEM:$IMG" >/dev/null || { echo "ERRO: pull falhou (pacote sem acesso para o token?)."; exit 1; }
fi
ok "imagem baixada"

# chave do JWT e volume (dono = UID 1654 do container)
[ -f "$ALVO/jwt.pem" ] || openssl ecparam -name prime256v1 -genkey -noout -out "$ALVO/jwt.pem"
sudo chown 1654:1654 "$ALVO/jwt.pem"; sudo chmod 400 "$ALVO/jwt.pem"
docker volume create "${PROJ}_mobile_api_keys" >/dev/null
docker run --rm -v "${PROJ}_mobile_api_keys":/keys alpine chown -R 1654:1654 /keys
ok "jwt.pem e volume de chaves"

# mobile-api.env (criado uma vez; nas próximas só troca a imagem)
if [ ! -f "$ALVO/mobile-api.env" ]; then
  API_PW=$(openssl rand -hex 24); MSECRET=$(cw_secret)
  ( umask 077; cat > "$ALVO/mobile-api.env" <<ENVF
MOBILE_API_IMAGE_TAG=$IMG
ConnectionStrings__ComercialWeb=Server=$MYSQL_HOST_DOCKER;Port=3306;User ID=mobile_api;Password=$API_PW;Database=$BANCO
ComercialWeb__MobileApiSecret=$MSECRET
ENVF
  )
  sudo mysql -e "CREATE USER IF NOT EXISTS 'mobile_api'@'172.29.250.%' IDENTIFIED BY '$API_PW'; ALTER USER 'mobile_api'@'172.29.250.%' IDENTIFIED BY '$API_PW';"
  unset API_PW MSECRET; ok "mobile-api.env criado e usuário mobile_api definido"
else
  sed -i "s/^MOBILE_API_IMAGE_TAG=.*/MOBILE_API_IMAGE_TAG=$IMG/" "$ALVO/mobile-api.env"
  [ "$(sudo mysql -N -e "SELECT COUNT(*) FROM mysql.user WHERE user='mobile_api' AND host='172.29.250.%'")" = 1 ] || { echo "ERRO: mobile-api.env existe mas o usuário mobile_api não: apague $ALVO/mobile-api.env e rode de novo."; exit 1; }
  ok "mobile-api.env existente mantido (só a imagem foi atualizada)"
fi

# firewall do MySQL para a sub-rede da API (só se o ufw estiver ativo)
sudo ufw status 2>/dev/null | grep -q "Status: active" && sudo ufw allow from "$SUBREDE" to any port 3306 proto tcp >/dev/null && ok "ufw: MySQL liberado só para $SUBREDE"

# migrations com conta de deploy temporária
DEPLOY_PW=$(openssl rand -hex 24)
sudo mysql -e "CREATE USER IF NOT EXISTS 'mobile_deploy'@'172.29.250.%' IDENTIFIED BY '$DEPLOY_PW'; ALTER USER 'mobile_deploy'@'172.29.250.%' IDENTIFIED BY '$DEPLOY_PW'; GRANT SELECT, INSERT, CREATE, ALTER, INDEX, REFERENCES ON $BANCO.* TO 'mobile_deploy'@'172.29.250.%';"
export ConnectionStrings__ComercialWeb="Server=$MYSQL_HOST_DOCKER;Port=3306;User ID=mobile_deploy;Password=$DEPLOY_PW;Database=$BANCO"
compose run --rm --no-deps -e ConnectionStrings__ComercialWeb mobile-api migrate
unset ConnectionStrings__ComercialWeb DEPLOY_PW
ok "migrations aplicadas"

# privilégios mínimos do mobile_api e remoção da conta de deploy
sudo mysql <<SQL
GRANT SELECT ON $BANCO.* TO 'mobile_api'@'172.29.250.%';
GRANT INSERT, UPDATE, DELETE ON $BANCO.mobile_sessions TO 'mobile_api'@'172.29.250.%';
GRANT INSERT, UPDATE, DELETE ON $BANCO.mobile_refresh_tokens TO 'mobile_api'@'172.29.250.%';
GRANT INSERT, UPDATE, DELETE ON $BANCO.mobile_push_tokens TO 'mobile_api'@'172.29.250.%';
GRANT INSERT ON $BANCO.mobile_sale_origins TO 'mobile_api'@'172.29.250.%';
GRANT UPDATE (read_at, archived_at, updated_at) ON $BANCO.notifications TO 'mobile_api'@'172.29.250.%';
DROP USER IF EXISTS 'mobile_deploy'@'172.29.250.%';
SQL
ok "privilégios do mobile_api; conta de deploy removida"
# Preferências de aviso (migration 0005, imagem nova): a tabela só existe a partir dessa imagem, então o GRANT é condicional.
if [ "$(sudo mysql -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$BANCO' AND table_name='mobile_push_mutes'")" = 1 ]; then
  sudo mysql -e "GRANT INSERT, UPDATE, DELETE ON $BANCO.mobile_push_mutes TO 'mobile_api'@'172.29.250.%';"
  ok "privilégio de mobile_push_mutes (preferências de aviso)"
fi

# subir
compose up -d
for i in $(seq 1 30); do [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8088/health)" = 200 ] && break; sleep 2; done
[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8088/health)" = 200 ] && ok "API respondendo em 127.0.0.1:8088/health" || { echo "ERRO: a API não respondeu. Logs:"; compose logs --tail=30 mobile-api; exit 1; }

# Apache + certificado
for m in proxy proxy_http headers; do apache2ctl -M 2>/dev/null | grep -q " ${m}_module" || sudo a2enmod "$m" >/dev/null; done
sudo cp "$ALVO/apache-vhost.api-dev.conf" /etc/apache2/sites-available/api-dev.conf; sudo a2ensite api-dev >/dev/null
sudo apache2ctl configtest && sudo systemctl reload apache2 && ok "Apache recarregado"
sudo test -d "/etc/letsencrypt/live/$DOMINIO" && ok "certificado de $DOMINIO já existe" || { sudo certbot --apache -d "$DOMINIO" --non-interactive --redirect && ok "certificado emitido"; }

echo; echo "== 4. Conferências =="
curl -s -o /dev/null -w "  saúde https:       %{http_code} (esperado 200)\n" "https://$DOMINIO/health"
curl -s -o /dev/null -w "  pair com código falso: %{http_code} (esperado 422; 503 = segredo/relógio divergente)\n" -X POST "https://$DOMINIO/api/v1/auth/pair" -H 'Content-Type: application/json' -d "{\"code\":\"$(printf 'a%.0s' $(seq 60))\"}"
printf '  rate limit (18 chamadas): '; for i in $(seq 1 18); do curl -s -o /dev/null -w '%{http_code} ' -X POST "https://$DOMINIO/api/v1/auth/pair" -H 'Content-Type: application/json' -d '{}'; done; echo "(esperado: 422 ... depois 429)"
# Push: precisa de Push__Enabled=true no container e de aparelhos que tenham registrado o token (APK com google-services.json).
PUSH_ON=$(docker exec "${PROJ}-mobile-api-1" printenv Push__Enabled 2>/dev/null || true)
[ "$PUSH_ON" = true ] && ok "push ligado no container (Push__Enabled=true)" || falha "push DESLIGADO no container (Push__Enabled='${PUSH_ON:-vazio}'): confira o compose.mobile-api.yaml em $ALVO"
echo "  aparelhos com push registrado: $(sudo mysql -N -e "SELECT COUNT(*) FROM $BANCO.mobile_push_tokens" 2>/dev/null || echo '?') (0 = nenhum APK com Firebase conectou ainda)"
echo; echo "Pronto. Para atualizar depois: bash $0 <novo SHA>. Para parar: docker compose -p $PROJ -f $ALVO/compose.mobile-api.yaml down"
