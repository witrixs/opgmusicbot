# 🎵 OPGBot v2 — Discord Music Bot + Web-панель (NestJS + Angular + Lavalink)

> Монорепозиторий: музыкальный Discord-бот на **NestJS/discord.js** с **Lavalink (Shoukaku)** + **Angular** веб-панель для управления плеером (REST + SSE) + готовый `Lavalink.jar`.

---

## 📋 Содержание

- [Технологический стек](#-технологический-стек)
- [Требования](#-требования)
- [Установка и запуск](#-установка-и-запуск)
- [Конфигурация](#-конфигурация)
- [Основные функции](#-основные-функции)
- [API Endpoints](#-api-endpoints)
- [Команды бота](#-команды-бота)
- [Структура проекта](#-структура-проекта)
- [Развертывание](#-развертывание)
- [Перед публикацией на GitHub](#-перед-публикацией-на-github)

---

## 🛠️ Технологический стек

### Backend
- **NestJS** — backend + API
- **discord.js** — Discord Bot API
- **Passport** (`passport-discord`, `passport-jwt`) — OAuth2 login + JWT
- **Shoukaku** — клиент для Lavalink
- **SSE (EventSource)** — live-обновления UI (`/api/music/stream`)

### Frontend
- **Angular 17** — веб-панель управления
- **RxJS** — состояние/реактивность
- **env.js генерация** — `frontend/scripts/generate-env.js` → `src/assets/env.js`

### Audio
- **Lavalink** — аудио сервер (в репо лежит `backend/lavalink/Lavalink.jar`)

---

## 📦 Требования

- **Node.js 18+**
- **Java 17+** (для Lavalink)
- **Discord Application** (бот + OAuth2)
- Доступный **Lavalink** (локально или на сервере)

---

## 🚀 Установка и запуск

### 1. Клонирование репозитория

```bash
git clone <repo-url>
cd "opgbot v2"
```

### 2. Lavalink (локально)

```bash
cd backend/lavalink
java -jar Lavalink.jar
```

По умолчанию Lavalink слушает `http://localhost:2333`.

### 3. Backend (NestJS)

```bash
cd backend
npm install
npm run start:dev
```

Backend поднимется на `http://localhost:3000`, API будет доступно по префиксу `http://localhost:3000/api`.

### 4. Frontend (Angular)

```bash
cd frontend
npm install
npm start
```

Frontend будет доступен на `http://localhost:4200`.

---

## ⚙️ Конфигурация

### Backend `.env`

Создайте файл `backend/.env`:

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

## URLs (нужны для правильных redirect'ов)
BACKEND_URL=http://localhost:3000
FRONTEND_URL=http://localhost:4200

## JWT (обязательно)
JWT_SECRET=replace_me_with_strong_secret

## CORS (опционально, через запятую)
CORS_ORIGIN=http://localhost:4200

## Defaults (опционально: чтобы не передавать guildId/voiceChannelId каждый раз)
DEFAULT_GUILD_ID=your_discord_server_id
DEFAULT_VOICE_CHANNEL_ID=your_voice_channel_id
```

Важно:
- `BOT_TOKEN` **обязателен** (в коде login использует именно `BOT_TOKEN`).
- Для SSE (`EventSource`) токен передаётся как query `?token=...` (это сделано специально, т.к. браузер не даёт поставить `Authorization` header).

### Discord Developer Portal (OAuth2)

Чтобы веб-логин работал, в настройках Discord приложения добавьте Redirect URL:
- `http://localhost:3000/api/auth/discord/callback` (для локальной разработки)

На проде это должно совпадать с `${BACKEND_URL}/api/auth/discord/callback`.

### Frontend `.env`

Создайте/проверьте файл `frontend/.env` (используется для генерации `src/assets/env.js`):

```env
API_BASE_URL=http://localhost:3000/api
```

### YouTube OAuth `refreshToken` для Lavalink

YouTube-плагин Lavalink использует OAuth, поэтому в `backend/lavalink/application.yml` в блоке `plugins.youtube.oauth` нужен валидный `refreshToken`:

```yaml
plugins:
  youtube:
    enabled: true
    allowSearch: true
    allowDirectVideoIds: true
    allowDirectPlaylistIds: true
    oauth:
      enabled: true
      refreshToken: "YOUR_REFRESH_TOKEN_HERE"
      skipInitialization: true
```

Как получить `refreshToken` (через Google OAuth Playground — самый простой способ):

1. **Создай проект в Google Cloud**  
   - Зайди в Google Cloud Console → включи **YouTube Data API v3**.  
   - Настрой **OAuth consent screen** (достаточно базовой конфигурации).  
   - В разделе **Credentials** создай OAuth Client ID (типа `Web application` или `Desktop app`).  

2. **Открой OAuth 2.0 Playground**  
   - Перейди на `https://developers.google.com/oauthplayground`.  
   - Справа сверху нажми **⚙️ Settings** → включи **Use your own OAuth credentials** и введи **Client ID / Client Secret** из шага выше.  

3. **Получение авторизационного кода**  
   - В списке API найди **YouTube Data API v3**.  
   - Отметь нужные scope'ы, обычно достаточно:  
     - `https://www.googleapis.com/auth/youtube.readonly`  
   - Нажми **Authorize APIs**, залогинься в нужный Google аккаунт и выдай доступ.  

4. **Обмен кода на токены**  
   - После авторизации вернёшься в Playground.  
   - Нажми **Exchange authorization code for tokens**.  
   - Внизу появится **access_token** и **refresh_token** — скопируй **`refresh_token`**.  

5. **Пропиши токен в `application.yml`**  
   - Вставь полученное значение в `plugins.youtube.oauth.refreshToken`.  
   - `skipInitialization` можно оставить в `true`, когда токен уже прописан.  

⚠️ Никогда не публикуй реальный `refreshToken` в публичном репозитории — используй плейсхолдеры в `application.yml` или отдельный `application.example.yml` для GitHub.

---

## ✨ Основные функции

### Для Discord
- 🎵 Воспроизведение по тексту или ссылке
- ⏸️ Пауза / ▶️ продолжить
- ⏭️ Скип / ⏹️ стоп
- 📋 Очередь
- 🔒 Защита управления: управлять музыкой можно только находясь в voice-канале (и в том же, где бот)

### Для Web-панели
- 🌐 Логин через Discord OAuth2
- 🎛️ Управление плеером через REST API
- 🔴 Live-обновления состояния через SSE (`/api/music/stream`)
- 🏰 Выбор сервера (гильдии), где есть бот

---

## 🔌 API Endpoints

Все endpoints учитывают `globalPrefix`: `http://localhost:3000/api/...`

### Auth (Discord OAuth2)
- `GET /api/auth/discord` — редирект на Discord login
- `GET /api/auth/discord/callback` — callback, выдаёт JWT и редиректит на фронт

### Status
- `GET /api/status` — health + статус бота

### Guilds (JWT)
- `GET /api/guilds` — список серверов, где есть бот и где состоит пользователь

### Music (JWT)
- `GET /api/music/state?guildId=...` — текущее состояние (плеер + очередь)
- `GET /api/music/stream?guildId=...&token=...` — SSE стрим обновлений
- `POST /api/music/play` — `{ query, guildId? }`
- `POST /api/music/pause` — `{ guildId? }`
- `POST /api/music/resume` — `{ guildId? }`
- `POST /api/music/skip` — `{ guildId? }`
- `POST /api/music/stop` — `{ guildId? }`
- `DELETE /api/music/queue/:trackId` — body `{ guildId? }`

---

## 🤖 Команды бота

- `/play <текст или ссылка>` — воспроизвести или добавить в очередь
- `/pause` — пауза
- `/resume` — продолжить
- `/skip` — пропустить
- `/queue` — очередь
- `/stop` — стоп и отключиться
- `/help` — список команд + кнопка на веб-панель
- `/ping` — задержка

---

## 📁 Структура проекта

```
opgbot v2/
├── backend/
│   ├── src/
│   │   ├── auth/                 # Discord OAuth2 + JWT
│   │   ├── bot/                  # Discord bot (slash-команды + кнопки)
│   │   ├── lavalink/             # Shoukaku client
│   │   ├── music/                # Music API + плеер/очередь
│   │   ├── guilds.controller.ts  # /api/guilds
│   │   ├── status.controller.ts  # /api/status
│   │   └── main.ts               # Запуск NestJS + globalPrefix(/api)
│   ├── lavalink/
│   │   ├── Lavalink.jar
│   │   └── application.yml
│   └── .env                      # локальная конфигурация (не коммитить)
│
└── frontend/
    ├── src/
    │   ├── app/
    │   └── assets/env.js          # генерируется из .env
    ├── scripts/generate-env.js
    └── .env                       # локальная конфигурация (не коммитить)
```

---

## 🚢 Развертывание

### PM2 (backend)

В `backend/` есть пример `ecosystem.config.js` (путь `cwd` под Linux нужно адаптировать под ваш сервер).

```bash
cd backend
npm run build
npm i -g pm2
pm2 start ecosystem.config.js
pm2 save
```

### Frontend

```bash
cd frontend
npm run build
```

Дальше можно отдавать `frontend/dist/...` любым статическим сервером или через Nginx.

### Nginx (HTTPS + SPA + API proxy)

```nginx
server {
    server_name domain.com;

    # === FRONTEND (SPA) ===
    root /var/www/opgbot/frontend-opgbot/browser;
    index index.html;

    # SPA маршруты
    location / {
        try_files $uri $uri/ /index.html;
    }

    # === BACKEND (API) ===
    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE / долгие соединения
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # Чтобы /api без слэша редиректило на /api/
    location = /api {
        return 301 /api/;
    }

    access_log /var/log/nginx/opgbot_access.log;
    error_log  /var/log/nginx/opgbot_error.log;

    listen 443 ssl http2;
    ssl_certificate     /etc/letsencrypt/live/domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/domain.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
}

server {
    listen 80;
    server_name domain.com;

    # HTTP → HTTPS
    return 301 https://$host$request_uri;
}
```

### Nginx (HTTPS + SPA + API proxy)

```apache
<IfModule mod_ssl.c>
<VirtualHost *:443>
    ServerName domain.com

    # === BACKEND (API) ===
    ProxyPreserveHost On
    
    ProxyPass        "/api/"  "http://127.0.0.1:3000/api/"
    ProxyPassReverse "/api/"  "http://127.0.0.1:3000/api/"
    
    # (опционально) чтобы /api без слэша тоже работал
    RedirectMatch 301 ^/api$ /api/

    # === FRONTEND (SPA) ===
    DocumentRoot /var/www/opgbot/frontend-opgbot/browser

    <Directory /var/www/opgbot/frontend-opgbot/browser>
        Options FollowSymLinks
        AllowOverride All
        Require all granted
        DirectoryIndex index.html

        # SPA маршруты
        RewriteEngine On
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule ^ /index.html [L]
    </Directory>

    ErrorLog ${APACHE_LOG_DIR}/app_error.log
    CustomLog ${APACHE_LOG_DIR}/app_access.log combined

    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/domain.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/domain.com/privkey.pem
    Include /etc/letsencrypt/options-ssl-apache.conf
</VirtualHost>
</IfModule>
```
---

**❤️Dev by witrix**

