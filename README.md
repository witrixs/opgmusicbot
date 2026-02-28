# 🎵 OPGBot v2 — Discord Music Bot + Web-панель (NestJS + Angular + Lavalink)

> Монорепозиторий: музыкальный Discord-бот на **NestJS/discord.js** с **Lavalink (Shoukaku)** + **Angular** веб-панель. Запуск через **Docker**.

---

## 📋 Содержание

- [Технологический стек](#-технологический-стек)
- [Требования](#-требования)
- [Установка через скрипт](#-установка-через-скрипт)
- [Установка Lavalink](#-установка-lavalink)
- [Конфигурация](#-конфигурация)
- [Основные функции](#-основные-функции)
- [API Endpoints](#-api-endpoints)
- [Команды бота](#-команды-бота)
- [Структура проекта](#-структура-проекта)
- [Развертывание](#-развертывание)

---

## 🛠️ Технологический стек

### Backend
- **NestJS** — backend + API + раздача статики SPA
- **discord.js** — Discord Bot API
- **Passport** (`passport-discord`, `passport-jwt`) — OAuth2 login + JWT
- **Shoukaku** — клиент для Lavalink
- **SSE (EventSource)** — live-обновления UI (`/api/music/stream`)

### Frontend
- **Angular** — веб-панель управления (сборка в `web/dist`, отдаётся NestJS с `/`)

### Audio
- **Lavalink** — аудио сервер (запускается отдельно, конфиг в `lavalink/application.yml`)

---

## 📦 Требования

- **Docker** и **Docker Compose**
- **Lavalink** — отдельно на хосте или в своей контейнерной среде (порт 2333)
- **Discord Application** (бот + OAuth2)

Для локальной разработки без Docker: Node.js 18+, Java 17+ (для Lavalink).

---

## 🚀 Установка через скрипт

На сервере приложение ставится одной цепочкой (скрипт скачивает Docker Compose и создаёт `.env` в `/opt/opgbot`, ставит команду `opgbot`):

```bash
curl -fsSL https://raw.githubusercontent.com/witrixs/opgmusicbot/main/scripts/script.sh -o /tmp/opgbot.sh \
  && sed -i 's/\r$//' /tmp/opgbot.sh \
  && sudo bash /tmp/opgbot.sh install \
  && sudo bash /tmp/opgbot.sh install-script
```

Дальше: отредактируйте `.env` (`opgbot edit-env`), [запустите Lavalink](#-установка-lavalink), затем `opgbot up`. Команды: `opgbot up`, `opgbot down`, `opgbot logs`, `opgbot status`, `opgbot edit-env` (и др. — `opgbot help`).

Скрипт в репо: `scripts/script.sh`. Чтобы установка по ссылке работала, в [witrixs/script](https://github.com/witrixs/script) должна быть папка `opgmusicbot` с `scripts/script.sh` и `docker-compose.yml`.

---

## 🎧 Установка Lavalink

В корне проекта уже есть папка `lavalink/` с JAR, плагином и `application.yml`. Lavalink не входит в образ бота — его запускают отдельно (нужна Java 17+).

В `lavalink/application.yml` задайте пароль (`lavalink.server.password`) и при необходимости YouTube `refreshToken`. Тот же пароль укажите в `.env` бота как `LAVALINK_PASSWORD`. Запуск:

```bash
cd lavalink
java -jar Lavalink.jar
```

Сервер слушает порт **2333**. При `network_mode: host` у бота в `.env` укажите `LAVALINK_HOST=localhost`.

---

## ⚙️ Конфигурация

### Корневой `.env`

Файл `.env` в корне проекта (рядом с `docker-compose.yml`):

```env
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
```

Важно:
- `BOT_TOKEN` **обязателен**.
- Для SSE токен передаётся как query `?token=...`.

### Discord Developer Portal (OAuth2)

В настройках Discord приложения укажите Redirect URL:
- На проде: `https://your-domain.example.com/api/auth/discord/callback`

### Lavalink `lavalink/application.yml`

Пароль и (опционально) YouTube OAuth задаются в `lavalink/application.yml`. Для YouTube-плагина нужен `refreshToken` в блоке `plugins.youtube.oauth` — как его получить, см. в старых версиях README или в документации Lavalink/YouTube-плагина. Не публикуйте реальный `refreshToken` в репозитории.

---

## ✨ Основные функции

### Для Discord
- 🎵 Воспроизведение по тексту или ссылке
- ⏸️ Пауза / ▶️ продолжить
- ⏭️ Скип / ⏹️ стоп
- 📋 Очередь
- 🔒 Защита управления: только из того же voice-канала, что и бот

### Для Web-панели
- 🌐 Логин через Discord OAuth2
- 🎛️ Управление плеером через REST API
- 🔴 Live-обновления через SSE (`/api/music/stream`)
- 🏰 Выбор сервера (гильдии), где есть бот

---

## 🔌 API Endpoints

Все endpoints под префиксом `/api/` (приложение на порту 3000).

### Auth (Discord OAuth2)
- `GET /api/auth/discord` — редирект на Discord login
- `GET /api/auth/discord/callback` — callback, выдаёт JWT и редирект на фронт

### Status
- `GET /api/status` — health + статус бота

### Guilds (JWT)
- `GET /api/guilds` — список серверов, где есть бот и пользователь

### Music (JWT)
- `GET /api/music/state?guildId=...` — состояние плеера и очереди
- `GET /api/music/stream?guildId=...&token=...` — SSE обновлений
- `POST /api/music/play` — `{ query, guildId? }`
- `POST /api/music/pause` / `resume` / `skip` / `stop` — `{ guildId? }`
- `DELETE /api/music/queue/:trackId` — body `{ guildId? }`

---

## 🤖 Команды бота

- `/play <текст или ссылка>` — воспроизвести или добавить в очередь
- `/pause` / `/resume` / `/skip` / `/queue` / `/stop`
- `/help` — список команд + кнопка на веб-панель
- `/ping` — задержка

---

## 📁 Структура проекта

```
opgmusicbot/
├── src/                    # NestJS (API + бот + раздача SPA)
│   ├── auth/
│   ├── bot/
│   ├── lavalink/
│   ├── music/
│   ├── main.ts
│   └── ...
├── web/                    # Angular веб-панель (сборка → web/dist)
├── lavalink/
│   ├── Lavalink.jar
│   └── application.yml
├── scripts/
│   └── script.sh           # установочный скрипт (команда opgbot)
├── docker-compose.yml
├── Dockerfile
├── .env                    # конфигурация (не коммитить)
└── package.json
```

---

## 🚢 Развертывание

После установки через скрипт и `opgbot up` приложение слушает порт 3000. В интернет его отдают через обратный прокси (Nginx или Apache) с HTTPS.

### Nginx (HTTPS, прокси всего трафика на приложение)

Вся выдача (и SPA, и API) идёт с одного приложения на порту 3000. Проксируем `/` на бэкенд:

```nginx
server {
    server_name your-domain.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000/;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE / долгие соединения
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    access_log /var/log/nginx/opgbot_access.log;
    error_log  /var/log/nginx/opgbot_error.log;

    listen 443 ssl http2;
    ssl_certificate     /etc/letsencrypt/live/your-domain.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.example.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
}

server {
    listen 80;
    server_name your-domain.example.com;
    return 301 https://$host$request_uri;
}
```

Замените `your-domain.example.com` на ваш домен и при необходимости пути к сертификатам.

### Apache (HTTPS, прокси всего трафика на приложение)

Аналогично: весь трафик на приложение на порту 3000 (SPA + API с одного входа).

```apache
<IfModule mod_ssl.c>
<VirtualHost *:443>
    ServerName your-domain.example.com

    ProxyPreserveHost On

    ProxyPass        "/"  "http://127.0.0.1:3000/"
    ProxyPassReverse "/"  "http://127.0.0.1:3000/"

    ErrorLog ${APACHE_LOG_DIR}/opgbot_error.log
    CustomLog ${APACHE_LOG_DIR}/opgbot_access.log combined

    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/your-domain.example.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/your-domain.example.com/privkey.pem
    Include /etc/letsencrypt/options-ssl-apache.conf
</VirtualHost>
</IfModule>
```

---

**❤️ Dev by witrix**
