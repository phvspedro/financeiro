#!/usr/bin/env bash
# Deploy do Controle Financeiro (Docker Compose) em servidor Ubuntu/Debian.
#
# Primeira instalação (como root ou com sudo):
#   curl -fsSL https://raw.githubusercontent.com/phvspedro/financeiro/master/deploy.sh -o deploy.sh
#   sudo bash deploy.sh
#
# Atualizar depois (no servidor):
#   sudo bash /opt/financeiro/deploy.sh
#
# Variáveis opcionais:
#   APP_DIR=/opt/financeiro   diretório de instalação
#   REPO_URL=...              repositório git
#   BRANCH=master             branch
#   APP_PORT=8080             porta publicada (só na criação do .env)
#   DOMAIN=...                padrão financeiro.lobbycenter.com.br (proxy reverso no Nginx do host; DOMAIN= vazio desativa)
#   SSL=1                     padrão 1: emite certificado Let's Encrypt (SSL=0 desativa)
#   CERTBOT_EMAIL=voce@x.com  e-mail do Let's Encrypt (opcional)
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/financeiro}"
REPO_URL="${REPO_URL:-https://github.com/phvspedro/financeiro.git}"
BRANCH="${BRANCH:-master}"
DOMAIN="${DOMAIN:-financeiro.lobbycenter.com.br}"
SSL="${SSL:-1}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"

log()  { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m  %s\n' "$*" >&2; }
die()  { printf '\033[1;31mERRO:\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "execute como root (sudo bash deploy.sh)"

# ---------------------------------------------------------------- dependências
# Aceita mudança de "Label"/metadados de repositórios de terceiros (ex.: PPA ondrej/php),
# que faz o `apt-get update` falhar e derrubaria a instalação do Docker.
log "Atualizando índices do apt..."
apt-get update -qq --allow-releaseinfo-change || warn "apt-get update teve avisos/erros; seguindo mesmo assim"

install_docker() {
  command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 && return
  log "Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
}

command -v git  >/dev/null 2>&1 || { log "Instalando git..."; apt-get install -y -qq git; }
command -v curl >/dev/null 2>&1 || { apt-get install -y -qq curl; }
install_docker

# ---------------------------------------------------------------------- código
if [ -d "$APP_DIR/.git" ]; then
  log "Atualizando código em $APP_DIR ($BRANCH)..."
  git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
  git -C "$APP_DIR" checkout --quiet "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
  log "Clonando $REPO_URL em $APP_DIR..."
  mkdir -p "$(dirname "$APP_DIR")"
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

# ------------------------------------------------------------------------ .env
if [ ! -f .env ]; then
  log "Gerando .env com senhas aleatórias..."
  rand() { head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 28; }
  cat > .env <<EOF
APP_PORT=${APP_PORT:-8080}
APP_KEY=base64:$(head -c 32 /dev/urandom | base64)
DB_DATABASE=financeiro
DB_USERNAME=financeiro
DB_PASSWORD=$(rand)
DB_ROOT_PASSWORD=$(rand)
EOF
  chmod 600 .env
else
  log ".env já existe, mantido (as senhas do banco não são alteradas)."
fi

set -a; . ./.env; set +a
APP_PORT="${APP_PORT:-8080}"

# ---------------------------------------------------------------------- backup
if docker compose ps --status running --services 2>/dev/null | grep -qx db; then
  mkdir -p "$BACKUP_DIR"
  file="$BACKUP_DIR/financeiro-$(date +%Y%m%d-%H%M%S).sql.gz"
  log "Backup do banco em $file"
  if docker compose exec -T db sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --no-tablespaces "$MYSQL_DATABASE"' | gzip > "$file"; then
    ls -1t "$BACKUP_DIR"/*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f   # mantém os 14 últimos
  else
    warn "backup falhou; continuando o deploy"
    rm -f "$file"
  fi
fi

# ----------------------------------------------------------------------- subir
log "Construindo e subindo os containers..."
docker compose up -d --build --remove-orphans

log "Aguardando a aplicação responder em http://127.0.0.1:${APP_PORT}..."
ok=0
for _ in $(seq 1 60); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${APP_PORT}/" || true)"
  if [ "$code" = "200" ]; then ok=1; break; fi
  sleep 3
done
if [ "$ok" -ne 1 ]; then
  docker compose ps
  docker compose logs --tail=50 api web
  die "a aplicação não respondeu; veja os logs acima"
fi

docker image prune -f >/dev/null 2>&1 || true

# ------------------------------------------------------------ proxy do domínio
if [ -n "$DOMAIN" ]; then
  command -v nginx >/dev/null 2>&1 || { log "Instalando nginx..."; apt-get install -y -qq nginx; }
  conf="/etc/nginx/sites-available/financeiro"
  log "Configurando Nginx para $DOMAIN -> 127.0.0.1:${APP_PORT}"
  cat > "$conf" <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
  ln -sf "$conf" /etc/nginx/sites-enabled/financeiro
  nginx -t && systemctl reload nginx

  if [ "$SSL" = "1" ]; then
    command -v certbot >/dev/null 2>&1 || apt-get install -y -qq certbot python3-certbot-nginx
    if [ -n "$CERTBOT_EMAIL" ]; then email_args=(-m "$CERTBOT_EMAIL"); else email_args=(--register-unsafely-without-email); fi
    certbot --nginx -d "$DOMAIN" "${email_args[@]}" --agree-tos --no-eff-email --redirect --non-interactive
  fi
fi

log "Deploy concluído."
if [ -n "$DOMAIN" ]; then
  echo "    URL: http$([ "$SSL" = "1" ] && echo s)://${DOMAIN}"
else
  echo "    Sem domínio, o app só escuta em 127.0.0.1:${APP_PORT} (use túnel SSH: ssh -L ${APP_PORT}:127.0.0.1:${APP_PORT} usuario@servidor)"
fi
echo "    Login inicial: admin@admin.com / admin101 (troque a senha após entrar)"
echo "    Logs:   docker compose -f $APP_DIR/docker-compose.yml logs -f"
