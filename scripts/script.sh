#!/usr/bin/env bash
set -e

# Handle @ symbol if used in installation (skip it)
if [ "$1" == "@" ]; then
  shift
fi

INSTALL_DIR="${INSTALL_DIR:-/opt}"
APP_NAME="${APP_NAME:-opgbot}"
APP_DIR="$INSTALL_DIR/$APP_NAME"
COMPOSE_FILE="$APP_DIR/docker-compose.yml"
ENV_FILE="$APP_DIR/.env"

# URL репозитория со скриптом и compose (ветка main)
REPO_RAW_URL="${REPO_RAW_URL:-https://raw.githubusercontent.com/witrixs/script/main/opgmusicbot}"

colorized_echo() {
  local color=$1
  local text=$2
  case $color in
    red)   printf "\033[91m%s\033[0m\n" "$text" ;;
    green) printf "\033[92m%s\033[0m\n" "$text" ;;
    yellow) printf "\033[93m%s\033[0m\n" "$text" ;;
    blue)  printf "\033[94m%s\033[0m\n" "$text" ;;
    cyan)  printf "\033[96m%s\033[0m\n" "$text" ;;
    *)     printf "%s\n" "$text" ;;
  esac
}

check_running_as_root() {
  if [ "$(id -u)" != "0" ]; then
    colorized_echo red "Эту команду нужно выполнять от root (или через sudo)."
    exit 1
  fi
}

detect_os() {
  if [ -f /etc/os-release ]; then
    OS=$(awk -F= '/^NAME=/{print $2}' /etc/os-release | tr -d '"')
  elif [ -f /etc/redhat-release ]; then
    OS=$(awk '{print $1}' /etc/redhat-release)
  else
    colorized_echo red "Не удалось определить ОС."
    exit 1
  fi
}

install_package() {
  local pkg="$1"
  colorized_echo blue "Установка $pkg..."
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq && apt-get install -y -qq "$pkg"
  elif command -v yum >/dev/null 2>&1; then
    yum install -y -q "$pkg"
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y -q "$pkg"
  elif command -v pacman >/dev/null 2>&1; then
    pacman -Sy --noconfirm --quiet "$pkg"
  else
    colorized_echo red "Неизвестный менеджер пакетов."
    exit 1
  fi
}

install_docker() {
  colorized_echo blue "Установка Docker..."
  curl -fsSL https://get.docker.com | sh
  colorized_echo green "Docker установлен."
}

detect_compose() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE="docker compose"
  elif docker-compose version >/dev/null 2>&1; then
    COMPOSE="docker-compose"
  else
    colorized_echo red "Не найден docker compose. Установите Docker и Docker Compose."
    exit 1
  fi
}

is_installed() {
  [ -d "$APP_DIR" ] && [ -f "$COMPOSE_FILE" ]
}

ensure_installed() {
  if ! is_installed; then
    colorized_echo red "opgbot не установлен. Сначала выполните: opgbot install"
    exit 1
  fi
}

ensure_up() {
  if [ -z "$($COMPOSE -f "$COMPOSE_FILE" -p "$APP_NAME" ps -q 2>/dev/null)" ]; then
    colorized_echo red "Сервисы не запущены. Выполните: opgbot up"
    exit 1
  fi
}

install_command() {
  check_running_as_root
  detect_os

  if is_installed; then
    colorized_echo yellow "opgbot уже установлен в $APP_DIR"
    read -p "Переустановить? (y/N): " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
      exit 0
    fi
    down_command 2>/dev/null || true
  fi

  if ! command -v curl >/dev/null 2>&1; then
    install_package curl
  fi
  if ! command -v docker >/dev/null 2>&1; then
    install_docker
  fi
  detect_compose

  mkdir -p "$APP_DIR"
  colorized_echo blue "Загрузка docker-compose.yml..."
  if ! curl -fsSL "$REPO_RAW_URL/docker-compose.deploy.yml" -o "$COMPOSE_FILE" 2>/dev/null; then
    if ! curl -fsSL "$REPO_RAW_URL/docker-compose.yml" -o "$COMPOSE_FILE" 2>/dev/null; then
      colorized_echo red "Не удалось загрузить compose. Проверьте:"
      colorized_echo yellow " $REPO_RAW_URL/docker-compose.deploy.yml"
      colorized_echo yellow " или $REPO_RAW_URL/docker-compose.yml"
      exit 1
    fi
  fi

  if [ ! -f "$ENV_FILE" ]; then
    colorized_echo blue "Создание .env..."
    cat > "$ENV_FILE" << 'ENVEOF'
## Discord Bot
BOT_TOKEN=your_discord_bot_token
BOT_STATUS_TEXT=музыку

## Lavalink (должно совпадать с lavalink.server.password в application.yml)
LAVALINK_HOST=localhost
LAVALINK_PORT=2333
LAVALINK_PASSWORD=youshallnotpass

## OAuth2 (Discord) — для входа в веб-панель
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret

## URLs (на проде — ваш домен с https)
BACKEND_URL=https://your-domain.example.com
FRONTEND_URL=https://your-domain.example.com

## JWT (обязательно)
JWT_SECRET=replace_me_with_strong_secret

## CORS (опционально, через запятую)
CORS_ORIGIN=https://your-domain.example.com
ENVEOF
    colorized_echo green "Создан $ENV_FILE — отредактируйте: opgbot edit-env"
  else
    colorized_echo green "Файл .env уже существует."
  fi

  colorized_echo green "Установка завершена. Каталог: $APP_DIR"
  colorized_echo cyan "Дальше: отредактируйте .env (opgbot edit-env), затем opgbot up"
  colorized_echo yellow "Lavalink запускайте отдельно (порт 2333)."
}

up_command() {
  ensure_installed
  detect_compose
  colorized_echo blue "Запуск контейнеров..."
  $COMPOSE -f "$COMPOSE_FILE" -p "$APP_NAME" up -d
  colorized_echo green "Сервисы запущены. Приложение: http://localhost:3000"
  colorized_echo cyan "Логи (Ctrl+C — выход):"
  $COMPOSE -f "$COMPOSE_FILE" -p "$APP_NAME" logs -f
}

down_command() {
  ensure_installed
  detect_compose
  colorized_echo blue "Остановка контейнеров..."
  $COMPOSE -f "$COMPOSE_FILE" -p "$APP_NAME" down
  colorized_echo green "Сервисы остановлены."
}

restart_command() {
  ensure_installed
  detect_compose
  down_command
  colorized_echo blue "Запуск контейнеров..."
  $COMPOSE -f "$COMPOSE_FILE" -p "$APP_NAME" up -d
  colorized_echo green "Перезапуск выполнен. Логи (Ctrl+C — выход):"
  $COMPOSE -f "$COMPOSE_FILE" -p "$APP_NAME" logs -f
}

status_command() {
  ensure_installed
  detect_compose
  if [ -z "$($COMPOSE -f "$COMPOSE_FILE" -p "$APP_NAME" ps -q 2>/dev/null)" ]; then
    colorized_echo yellow "Статус: остановлен"
    return
  fi
  colorized_echo green "Статус: запущен"
  $COMPOSE -f "$COMPOSE_FILE" -p "$APP_NAME" ps
}

logs_command() {
  ensure_installed
  detect_compose
  $COMPOSE -f "$COMPOSE_FILE" -p "$APP_NAME" logs -f "$@"
}

update_command() {
  check_running_as_root
  ensure_installed
  detect_compose
  colorized_echo blue "Обновление образа..."
  $COMPOSE -f "$COMPOSE_FILE" -p "$APP_NAME" pull
  colorized_echo blue "Перезапуск..."
  $COMPOSE -f "$COMPOSE_FILE" -p "$APP_NAME" up -d
  colorized_echo green "Обновление завершено."
}

uninstall_command() {
  check_running_as_root
  if is_installed; then
    detect_compose
    read -p "Удалить opgbot из $APP_DIR? (y/N): " confirm
    if [[ "$confirm" =~ ^[Yy]$ ]]; then
      down_command
      read -p "Удалить каталог $APP_DIR? (y/N): " confirm_data
      if [[ "$confirm_data" =~ ^[Yy]$ ]]; then
        rm -rf "$APP_DIR"
        colorized_echo green "Удалено: $APP_DIR"
      else
        colorized_echo yellow "Каталог оставлен: $APP_DIR"
      fi
    fi
  else
    colorized_echo yellow "Каталог $APP_DIR не найден."
  fi
  rm -f /usr/local/bin/opgbot /usr/bin/opgbot
  rm -f /etc/profile.d/opgbot.sh
  colorized_echo green "Команда opgbot удалена из системы."
}

edit_command() {
  ensure_installed
  EDITOR="${EDITOR:-nano}"
  if ! command -v "$EDITOR" >/dev/null 2>&1; then
    detect_os
    install_package nano
    EDITOR=nano
  fi
  $EDITOR "$COMPOSE_FILE"
}

edit_env_command() {
  ensure_installed
  EDITOR="${EDITOR:-nano}"
  if ! command -v "$EDITOR" >/dev/null 2>&1; then
    detect_os
    install_package nano
    EDITOR=nano
  fi
  $EDITOR "$ENV_FILE"
}

install_script_to_path() {
  check_running_as_root
  local dest="/usr/local/bin/opgbot"
  colorized_echo blue "Установка скрипта в $dest..."
  if [ -f "$0" ] && [ -r "$0" ] && grep -q 'opgbot' "$0" 2>/dev/null; then
    cp "$0" "$dest"
  else
    curl -fsSL "$REPO_RAW_URL/scripts/script.sh" -o "$dest" || {
      colorized_echo red "Не удалось загрузить скрипт. Проверьте REPO_RAW_URL и доступ в интернет."
      exit 1
    }
  fi
  chmod +x "$dest"
  if [ -d /usr/bin ] && [ ! -L /usr/bin/opgbot ]; then
    ln -sf "$dest" /usr/bin/opgbot
    colorized_echo green "Создан симлинк /usr/bin/opgbot"
  fi
  local profile_d="/etc/profile.d/opgbot.sh"
  if [ ! -f "$profile_d" ]; then
    echo 'export PATH="/usr/local/bin:$PATH"' > "$profile_d"
    chmod 644 "$profile_d"
    colorized_echo green "Добавлен $profile_d для новых сессий"
  fi
  colorized_echo green "Готово."
  usage
}

usage() {
  local name="opgbot"
  colorized_echo blue "======================================"
  colorized_echo cyan " opgbot — управление"
  colorized_echo blue "======================================"
  echo
  colorized_echo cyan "Использование:"
  echo " $name [команда]"
  echo
  colorized_echo cyan "Команды:"
  echo " install        — установить"
  echo " up             — запустить контейнеры"
  echo " down           — остановить контейнеры"
  echo " restart        — перезапустить"
  echo " status         — показать статус"
  echo " logs           — логи"
  echo " update         — обновить образ и перезапустить"
  echo " uninstall      — удалить установку"
  echo " edit           — редактировать docker-compose.yml"
  echo " edit-env       — редактировать .env"
  echo " help           — эта справка"
  echo
  colorized_echo cyan "Каталог установки: $APP_DIR"
  colorized_echo blue "======================================"
}

case "${1:-help}" in
  install)         install_command ;;
  install-script)  install_script_to_path ;;
  up)              up_command ;;
  down)            down_command ;;
  restart)         restart_command ;;
  status)          status_command ;;
  logs)            shift; logs_command "$@" ;;
  update)          update_command ;;
  uninstall)       uninstall_command ;;
  edit)            edit_command ;;
  edit-env)        edit_env_command ;;
  help|--help|-h|*) usage ;;
esac
