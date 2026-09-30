#!/usr/bin/env bash
# MAPEAMENTO SOMENTE LEITURA da VPS antes de qualquer deploy da API do app.
# Não instala nada, não cria nada, não altera nada e não imprime segredos (nenhuma variável de ambiente, senha ou chave).
# Uso: bash mapear-vps.sh 2>&1 | tee /tmp/mapa-vps.txt   (cole o resultado na conversa)
set -u
SUBREDE=172.29.250.0/24
sec() { printf '\n===== %s =====\n' "$1"; }
has() { command -v "$1" >/dev/null 2>&1 && echo "OK   $1: $(command -v "$1")" || echo "FALTA $1"; }

sec "Sistema"
. /etc/os-release 2>/dev/null; echo "${PRETTY_NAME:-?} | kernel $(uname -r)"; echo "usuário: $(id -un) (uid $(id -u)); sudo sem senha: $(sudo -n true 2>/dev/null && echo sim || echo não)"
df -h / /srv 2>/dev/null | sed -n '1,3p'; free -h | sed -n '1,2p'
echo "relógio sincronizado: $(timedatectl show -p NTPSynchronized --value 2>/dev/null || echo '?')  ($(date -u +%FT%TZ))"

sec "Ferramentas (só o que o deploy da API precisa)"
for c in docker openssl curl certbot apache2ctl mysql; do has "$c"; done
docker --version 2>/dev/null; docker compose version 2>/dev/null | head -1 || echo "FALTA plugin docker compose"

sec "Docker: containers em execução (nomes e imagens, sem variáveis)"
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}' 2>/dev/null | sed 's/\t/  |  /g'

sec "Docker: redes e sub-redes (a da API é $SUBREDE; não pode haver conflito)"
for n in $(docker network ls -q 2>/dev/null); do docker network inspect "$n" --format '{{.Name}}  {{range .IPAM.Config}}{{.Subnet}} {{end}}' 2>/dev/null; done
echo "conflito com $SUBREDE: $(for n in $(docker network ls -q 2>/dev/null); do docker network inspect "$n" --format '{{range .IPAM.Config}}{{.Subnet}} {{end}}'; done | grep -c '172\.29\.250\.') rede(s)"
ip -4 route 2>/dev/null | grep -E '172\.29\.250\.' || echo "rota para 172.29.250.0/24: nenhuma (ok)"

sec "Docker: já existe algo do app mobile?"
docker ps -a --format '{{.Names}}' 2>/dev/null | grep -i mobile || echo "nenhum container mobile"
docker volume ls --format '{{.Name}}' 2>/dev/null | grep -i mobile || echo "nenhum volume mobile"
docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep -i 'comercialweb-mobile' || echo "nenhuma imagem da API"
ls -la /srv 2>/dev/null

sec "Portas em escuta (80, 443, 3306, 8088)"
ss -ltnp 2>/dev/null | awk 'NR==1 || /:(80|443|3306|8088) /' | sed 's/users:(("//; s/",pid=[0-9]*,fd=[0-9]*))//' 
echo "8088 livre: $(ss -ltn 2>/dev/null | grep -c ':8088 ' | sed 's/^0$/sim/;s/^[1-9].*/NÃO/')"

sec "Apache"
apache2ctl -v 2>/dev/null | head -1
echo "módulos necessários (proxy, proxy_http, headers, ssl):"; apache2ctl -M 2>/dev/null | grep -E ' (proxy|proxy_http|headers|ssl)_module' || echo "  nenhum dos quatro habilitado"
echo "sites habilitados:"; ls /etc/apache2/sites-enabled 2>/dev/null
echo "vhost da API de dev já existe? $(ls /etc/apache2/sites-available/ 2>/dev/null | grep -i 'api-dev' || echo não)"
echo "ServerName/ServerAlias em uso:"; grep -rhiE '^\s*(ServerName|ServerAlias)' /etc/apache2/sites-enabled 2>/dev/null | sed 's/^\s*//' | sort -u

sec "Certificados (certbot)"
sudo -n certbot certificates 2>/dev/null | grep -E 'Certificate Name|Domains|Expiry' || echo "sem sudo sem senha: rode 'sudo certbot certificates' e cole só os nomes e domínios"

sec "DNS da API de dev (deve apontar para este servidor)"
echo "api.dev -> $(dig +short api.dev.infinitsolucoesweb.com.br 2>/dev/null | tr '\n' ' ')   | IP público deste servidor: $(curl -s -m 5 https://ifconfig.me 2>/dev/null)"

sec "Firewall"
sudo -n ufw status 2>/dev/null | head -14 || echo "sem sudo sem senha: rode 'sudo ufw status'"

sec "MySQL do host (sem senhas)"
echo "escuta: $(ss -ltn 2>/dev/null | awk '$4 ~ /:3306$/ {print $4}' | tr '\n' ' ')"
sudo -n mysql -N -e "SHOW VARIABLES LIKE 'bind_address'; SELECT CONCAT('usuario: ',user,'@',host) FROM mysql.user WHERE user NOT LIKE 'mysql.%' AND user NOT IN ('root','debian-sys-maint'); SELECT CONCAT('banco: ',schema_name) FROM information_schema.schemata WHERE schema_name LIKE 'comercial%'; SELECT CONCAT('tabelas mobile_ em ',table_schema,': ',COUNT(*)) FROM information_schema.tables WHERE table_name LIKE 'mobile\\_%' GROUP BY table_schema;" 2>/dev/null || echo "sem sudo sem senha para o mysql: rode 'sudo mysql' à mão (comandos no docs/DEPLOY_DEV.md)"

sec "ComercialWeb de dev: o segredo do app está definido? (só o TAMANHO, nunca o valor)"
for c in $(docker ps --format '{{.Names}}' 2>/dev/null | grep -E '^comercial-web-dev-app_'); do echo "$c: MOBILE_API_SECRET com $(docker exec "$c" printenv MOBILE_API_SECRET 2>/dev/null | tr -d '\n' | wc -c) caracteres (0 = não definido)"; done
docker exec "$(docker ps --format '{{.Names}}' | grep -m1 -E '^comercial-web-dev-app_')" php artisan route:list --path=api/mobile/v1/pair 2>/dev/null | grep -c pair | sed 's/^/rota \/api\/mobile\/v1\/pair existe no ComercialWeb de dev (1 = sim): /'

sec "Fim. Nada foi instalado, criado ou alterado."
