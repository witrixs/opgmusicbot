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

---

## ⚠️ Перед публикацией на GitHub

Перед пушем **обязательно проверь**, что ты не публикуешь секреты:

- ✅ **Не коммить** `backend/.env`, `frontend/.env`
- ✅ **Не коммить** `node_modules/`, `dist/`, `.angular/`
- ⚠️ В `backend/lavalink/application.yml` сейчас могут быть **пароли/токены** (например, YouTube OAuth refresh token).  
  Для публичного репо лучше хранить пример (`application.example.yml`) с плейсхолдерами, а реальные значения держать локально/в секретах CI.

---

**Dev by witrix**

