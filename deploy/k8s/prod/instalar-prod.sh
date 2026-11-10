#!/usr/bin/env bash
# Instala/atualiza a API do app mobile em PRODUÇÃO (K3s, namespace comercial-prod, MySQL no host).
#
# SÓ mexe no que é do mobile: Deployment/Service/PVC/IngressRoute/Middlewares/Certificate `mobile-api*`, Secrets
# `mobile-api-*`, Job `mobile-api-migrate`, usuários MySQL `mobile_api` e `mobile_deploy` (temporário) e tabelas mobile_*.
# NÃO toca no Traefik (o IP real já vem do hostPort desde 21/10/2026), no ComercialWeb nem em outros namespaces.
# Pode rodar de novo (idempotente). Nunca imprime senhas.
#
#   bash instalar-prod.sh --verificar             só confere tudo, NÃO altera nada
#   bash instalar-prod.sh <SHA_COMPLETO_DA_MAIN>  confere e instala (pede confirmação)
#
# Rode no nó prod-01 com um usuário que tenha kubectl no cluster e sudo (para o mysql do host).
# kubectl só com sudo? KUBECTL='sudo k3s kubectl' bash instalar-prod.sh ...
set -euo pipefail

NS=comercial-prod
DOMINIO=api.infinitsolucoesweb.com.br
IMAGEM=ghcr.io/kailonalexandre/comercialweb-mobile-api
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KC() { ${KUBECTL:-kubectl} "$@"; }
K() { KC -n "$NS" "$@"; }

MODO=instalar; IMG=""
case "${1:-}" in --verificar) MODO=verificar ;; "") echo "Uso: $0 --verificar | $0 <SHA completo da main>"; exit 2 ;; *) IMG="$1" ;; esac
[ "$MODO" = instalar ] && [[ "$IMG" =~ ^[0-9a-f]{40}$ ]] || [ "$MODO" = verificar ] || { echo "ERRO: informe o SHA COMPLETO (40 caracteres hexadecimais) do commit da imagem."; exit 2; }

ok() { printf '  \033[32mOK\033[0m    %s\n' "$*"; }
aviso() { printf '  \033[33mAVISO\033[0m %s\n' "$*"; }
falha() { printf '  \033[31mFALHA\033[0m %s\n' "$*"; FALHOU=1; }
FALHOU=0
CWC=""   # container PHP do ComercialWeb (o outro container do pod é o nginx)
cw_env() { K exec deploy/comercial-web -c "$CWC" -- printenv "$1" 2>/dev/null | tr -d '\n\r' || true; }
tabela() { [ "$(sudo mysql -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$BANCO' AND table_name='$1'")" = 1 ]; }

echo "== 1. Verificações (nada é alterado) =="
K get deploy comercial-web >/dev/null 2>&1 && ok "kubectl alcança $NS" || { falha "kubectl sem acesso a $NS (tente KUBECTL='sudo k3s kubectl')"; exit 1; }
sudo mysql -N -e "SELECT 1" >/dev/null 2>&1 && ok "sudo mysql funciona" || { falha "sudo mysql não funciona"; exit 1; }
for f in deployment.yaml middlewares.yaml ingressroute.yaml kustomization.yaml migrate-job.yaml; do [ -f "$AQUI/$f" ] && ok "arquivo $f" || falha "arquivo $f não está ao lado do script"; done

CWC=$(K get deploy comercial-web -o jsonpath='{.spec.template.spec.containers[*].name}' | tr ' ' '\n' | grep -vx nginx | head -1)
DB_HOST=$(cw_env DB_HOST); BANCO=$(cw_env DB_DATABASE); DB_USER=$(cw_env DB_USERNAME)
[ -n "$DB_HOST" ] && [ -n "$BANCO" ] && [ -n "$DB_USER" ] && ok "ComercialWeb usa o MySQL $DB_HOST, banco $BANCO" || { falha "não li DB_HOST/DB_DATABASE/DB_USERNAME do container $CWC"; exit 1; }
# A API conecta de onde o ComercialWeb conecta (pods saem pelo nó): reaproveita o `host` do usuário MySQL dele.
ORIGEM=$(sudo mysql -N -e "SELECT host FROM mysql.user WHERE user='$DB_USER' AND host NOT IN ('localhost','127.0.0.1','::1') LIMIT 1" 2>/dev/null || true)
[ -n "$ORIGEM" ] && ok "origem MySQL dos pods: '$ORIGEM' (a mesma do usuário do ComercialWeb)" || falha "não achei o host MySQL do usuário do ComercialWeb"
N=$(cw_env MOBILE_API_SECRET | wc -c)
[ "$N" -ge 32 ] && ok "MOBILE_API_SECRET do ComercialWeb com $N caracteres" || falha "MOBILE_API_SECRET ausente/curto ($N) no ComercialWeb: defina 32+ caracteres no ambiente dele antes"
for t in mobile_terminals mobile_audit_events notifications; do tabela "$t" && ok "tabela $t existe" || falha "tabela $t não existe (migrations do ComercialWeb?)"; done
KC get clusterissuer letsencrypt-prod >/dev/null 2>&1 && ok "ClusterIssuer letsencrypt-prod" || falha "ClusterIssuer letsencrypt-prod não existe"
MEU=$(curl -4 -s -m 6 https://ifconfig.me || true); DNS=$(getent ahostsv4 "$DOMINIO" | awk 'NR==1{print $1}' || true)
[ -n "$DNS" ] && [ "$DNS" = "$MEU" ] && ok "DNS $DOMINIO -> $DNS (este servidor)" || aviso "DNS $DOMINIO -> '${DNS:-nada}' mas o IP público é '${MEU:-?}': o certificado pode falhar"

if [ "$FALHOU" = 1 ]; then echo; echo "Há FALHAS acima. Nada foi alterado. Resolva e rode de novo."; exit 1; fi
[ "$MODO" = verificar ] && { echo; echo "Tudo certo. Para instalar: bash $0 <SHA completo da main>"; exit 0; }

echo; echo "== 2. O que este script VAI criar/alterar =="
cat <<TXT
  - Secrets mobile-api-jwt e mobile-api-env (só se ainda não existirem) e mobile-api-migrate-env (apagado no fim)
  - MySQL ($BANCO): usuário mobile_api@'$ORIGEM' (mínimo privilégio), mobile_deploy@'$ORIGEM' (apagado no fim), tabelas mobile_*
  - Job mobile-api-migrate e, depois dele, Deployment/Service/PVC/IngressRoute/Middlewares/Certificate da API ($IMAGEM:$IMG)
  Nada mais. Não toca no Traefik, no ComercialWeb nem em outros namespaces.
TXT
read -r -p "Digite SIM para continuar: " R; [ "$R" = SIM ] || { echo "Cancelado. Nada foi alterado."; exit 0; }

echo; echo "== 3. Instalando =="
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
O="'$ORIGEM'"

# chave do JWT (uma vez: trocar derruba todas as sessões)
if ! K get secret mobile-api-jwt >/dev/null 2>&1; then
  openssl ecparam -name prime256v1 -genkey -noout -out "$TMP/jwt.pem"
  K create secret generic mobile-api-jwt --from-file=jwt.pem="$TMP/jwt.pem" >/dev/null; shred -u "$TMP/jwt.pem"
  ok "secret mobile-api-jwt criado"
else ok "secret mobile-api-jwt mantido"; fi

# conexão da API e segredo compartilhado com o ComercialWeb (uma vez)
if ! K get secret mobile-api-env >/dev/null 2>&1; then
  API_PW=$(openssl rand -hex 24)
  sudo mysql -e "CREATE USER IF NOT EXISTS 'mobile_api'@$O IDENTIFIED BY '$API_PW'; ALTER USER 'mobile_api'@$O IDENTIFIED BY '$API_PW';"
  K create secret generic mobile-api-env \
    --from-literal=ConnectionStrings__ComercialWeb="Server=$DB_HOST;Port=3306;User ID=mobile_api;Password=$API_PW;Database=$BANCO" \
    --from-literal=ComercialWeb__MobileApiSecret="$(cw_env MOBILE_API_SECRET)" >/dev/null
  unset API_PW; ok "secret mobile-api-env criado e usuário mobile_api definido"
else
  [ "$(sudo mysql -N -e "SELECT COUNT(*) FROM mysql.user WHERE user='mobile_api' AND host=$O")" = 1 ] || { echo "ERRO: secret mobile-api-env existe mas o usuário mobile_api@$ORIGEM não: apague o secret e rode de novo."; exit 1; }
  ok "secret mobile-api-env mantido"
fi

# migrations com conta de deploy temporária (DDL; sem DROP/DELETE/UPDATE)
DEPLOY_PW=$(openssl rand -hex 24)
sudo mysql -e "CREATE USER IF NOT EXISTS 'mobile_deploy'@$O IDENTIFIED BY '$DEPLOY_PW'; ALTER USER 'mobile_deploy'@$O IDENTIFIED BY '$DEPLOY_PW'; GRANT SELECT, INSERT, CREATE, ALTER, INDEX, REFERENCES ON $BANCO.* TO 'mobile_deploy'@$O;"
limpar_deploy() { K delete secret mobile-api-migrate-env --ignore-not-found >/dev/null; sudo mysql -e "DROP USER IF EXISTS 'mobile_deploy'@$O;"; }
trap 'rm -rf "$TMP"; limpar_deploy' EXIT
K delete secret mobile-api-migrate-env --ignore-not-found >/dev/null
K create secret generic mobile-api-migrate-env --from-literal=ConnectionStrings__ComercialWeb="Server=$DB_HOST;Port=3306;User ID=mobile_deploy;Password=$DEPLOY_PW;Database=$BANCO" >/dev/null
unset DEPLOY_PW
K delete job mobile-api-migrate --ignore-not-found >/dev/null
sed "s/MOBILE_API_IMAGE_TAG/$IMG/" "$AQUI/migrate-job.yaml" | K apply -f - >/dev/null
# Espera concluir OU falhar (kubectl wait só espera uma condição: com falha ficaria parado até o timeout).
FIM=""
for _ in $(seq 1 150); do
  FIM=$(K get job mobile-api-migrate -o jsonpath='{.status.succeeded}/{.status.failed}' 2>/dev/null || true)
  case "$FIM" in 1/*|*/1) break ;; esac
  sleep 2
done
if [ "${FIM%%/*}" != 1 ]; then
  K logs job/mobile-api-migrate --tail=40 || true
  echo "ERRO: migrations falharam (log acima). A API em execução não foi trocada."; exit 1
fi
K logs job/mobile-api-migrate --tail=10 | sed 's/^/    /'
limpar_deploy; trap 'rm -rf "$TMP"' EXIT; ok "migrations aplicadas; conta de deploy removida"

# privilégios mínimos do mobile_api (as tabelas já existem depois das migrations)
sudo mysql <<SQL
GRANT SELECT ON $BANCO.* TO 'mobile_api'@$O;
GRANT INSERT, UPDATE, DELETE ON $BANCO.mobile_sessions TO 'mobile_api'@$O;
GRANT INSERT, UPDATE, DELETE ON $BANCO.mobile_refresh_tokens TO 'mobile_api'@$O;
GRANT INSERT, UPDATE, DELETE ON $BANCO.mobile_push_tokens TO 'mobile_api'@$O;
GRANT INSERT, UPDATE, DELETE ON $BANCO.mobile_push_mutes TO 'mobile_api'@$O;
GRANT INSERT ON $BANCO.mobile_sale_origins TO 'mobile_api'@$O;
GRANT INSERT ON $BANCO.mobile_audit_events TO 'mobile_api'@$O;
GRANT UPDATE (read_at, archived_at, updated_at) ON $BANCO.notifications TO 'mobile_api'@$O;
SQL
ok "privilégios do mobile_api"

# API (kustomize com o SHA no lugar do marcador)
cp "$AQUI"/{deployment,middlewares,ingressroute,kustomization}.yaml "$TMP"/
sed -i "s/MOBILE_API_IMAGE_TAG/$IMG/" "$TMP/deployment.yaml"
KC apply -k "$TMP" >/dev/null
K rollout status deploy/mobile-api --timeout=180s || { echo "ERRO: a API não ficou pronta. Logs:"; K logs deploy/mobile-api --tail=40 || true; echo "Voltar: kubectl -n $NS rollout undo deploy/mobile-api"; exit 1; }
ok "API no ar ($IMG)"
pronto() { [ "$(K get certificate mobile-api-tls -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}')" = True ]; }
for _ in $(seq 1 30); do pronto && break; sleep 4; done
pronto && ok "certificado de $DOMINIO pronto" || aviso "certificado ainda não pronto: kubectl -n $NS describe certificate mobile-api-tls"

echo; echo "== 4. Conferências =="
curl -s -o /dev/null -w "  saúde https:           %{http_code} (esperado 200)\n" "https://$DOMINIO/health"
curl -s -o /dev/null -w "  pair com código falso: %{http_code} (esperado 422; 503 = segredo/relógio divergente ou API sem acesso ao ComercialWeb)\n" -X POST "https://$DOMINIO/api/v1/auth/pair" -H 'Content-Type: application/json' -d "{\"code\":\"$(printf 'a%.0s' $(seq 60))\"}"
echo "  últimas linhas do log da API (sem ERROR é o esperado):"; K logs deploy/mobile-api --tail=10 | sed 's/^/    /'
echo; echo "Pronto. Atualizar depois: bash $0 <novo SHA da main>. Voltar a imagem: kubectl -n $NS rollout undo deploy/mobile-api"
