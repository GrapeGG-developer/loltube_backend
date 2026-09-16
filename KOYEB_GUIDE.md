# LolTube - Деплой на Koyeb.com (бесплатно, без карты, видео в интернете)

Koyeb - бесплатный хостинг без карты, не просит карту, дает домен `https://xxx.koyeb.app`

## Что получишь
- Бекенд URL типа `https://loltube-grapescript-xxxxx.koyeb.app` - 24/7
- 512MB RAM, 0.1 vCPU бесплатно, не засыпает быстро (как Render)
- Фронт остается на https://grapescript.gitverse.site/loltube/
- **Минус:** без карты диск ephemeral - видео могут пропасть при ре-деплое (как на Render). Для постоянного хранения потом подключим Cloudinary/Supabase.

## Шаг 0 - Залей код на GitHub

Koyeb деплоит из GitHub, поэтому сначала залей бекенд на GitHub.

1. Иди на https://github.com -> New repository -> `loltube-backend` (Public)
2. В папке `loltube-deploy-flyio` (или `loltube-deploy-koyeb`) выполни:

```powershell
cd "C:\Users\Zamalutdinov Danis\Desktop\Projects\LolTubeServer\loltube-deploy-flyio"
git init
git add .
git commit -m "LolTube v5.0 F9"
git branch -M main
git remote add origin https://github.com/ТВОЙ_НИК/loltube-backend.git
git push -u origin main
```

Замени `ТВОЙ_НИК` на свой ник GitHub.

Если нет git - скачай https://git-scm.com/

**Или просто:** на GitHub нажми `Add file -> Upload files` и закинь все файлы из архива `loltube-deploy-koyeb.zip` (server.js, package.json, public/, Dockerfile)

## Шаг 1 - Регистрация на Koyeb

1. Иди на https://www.koyeb.com/
2. Нажми `Sign up` -> `Continue with GitHub` (войди через GitHub)
3. Подтверди email если попросит

**Карту НЕ просит!**

## Шаг 2 - Создай сервис

1. В дашборде Koyeb нажми `Create App` или `Create Service`
2. Выбери `GitHub` -> выбери репозиторий `loltube-backend` -> ветка `main`
3. Нажми `Import`

## Шаг 3 - Настройки сервиса (ВАЖНО)

**Builder:**
- Выбери `Dockerfile` (рекомендую) или `Buildpack -> Node.js`
- Если Dockerfile - оставь как есть, он уже есть в проекте
- Dockerfile path: `Dockerfile`

**Instance / Region:**
- Region: `Frankfurt (fra)` - близко к России
- Instance type: `Free` (512MB RAM, 0.1 vCPU) - бесплатно
- Scaling: Min 1, Max 1

**Port:**
- Port: `3000` (наш сервер слушает 3000, но Koyeb сам задаст PORT, у нас `process.env.PORT || 3000` - работает)
- Protocol: `HTTP`

**Environment variables (нажми Add variable):**
```
NODE_ENV=production
PORT=3000
JWT_SECRET=loltube-secret-violet-2024-v2-grapescript
```

**Health check (оставь дефолт):**
- Path: `/api/config`

Нажми `Deploy`

## Шаг 4 - Жди деплой (2-4 мин)

Koyeb будет:
1. Клонировать репо
2. `npm install`
3. `node server.js`
4. Даст URL

В логах увидишь:
```
LolTube v2 running on http://0.0.0.0:3000
```

Когда станет `Healthy` - скопируй URL, например:
```
https://loltube-grapescript-abc123.koyeb.app
```
или
```
https://loltube-backend-xxxxx.koyeb.app
```

Проверь в браузере:
```
https://ТВОЙ_URL.koyeb.app/api/config
```
Должен вернуть `{"name":"LolTube","version":"2.0",...}`

## Шаг 5 - Подключи фронт

1. Открой файл `public/config.js` в репо фронта (или локально)
2. Пропиши URL бекенда Koyeb:

```js
window.LOLTUBE_API_BASE = 'https://loltube-grapescript-abc123.koyeb.app';
```

3. Залей на GitVerse в репо `loltube` (замени 4 файла: index.html, style.css, app.js, config.js)
4. Подожди 2 мин, открой https://grapescript.gitverse.site/loltube/ + Ctrl+F5

Индикатор должен стать зеленым:
`БЕКЕНД: ОНЛАЙН • https://loltube-grapescript-abc123.koyeb.app • v2.0`

## Шаг 6 - Загрузи видео

- Загрузи видео через сайт
- Видео сохранится в `/app/uploads` на Koyeb
- **ВНИМАНИЕ:** на бесплатном тарифе Koyeb диск ephemeral - при новом деплое видео могут пропасть! Для теста ок.

Чтобы видео не пропадали - надо подключить S3/Cloudinary/Supabase. Скажи - сделаю версию `server-cloudinary.js` с 25GB бесплатно.

## Полезные команды / настройки Koyeb

- **Логи:** в дашборде Koyeb -> твой сервис -> Logs
- **Редепплой:** запушь новый коммит в GitHub -> Koyeb сам передеплоит
- **Переменные:** Settings -> Environment variables
- **Домен:** Settings -> Domains -> твой URL
- **Рестарт:** Settings -> Redeploy

## Лимиты Koyeb Free

- 1 сервис бесплатно
- 512MB RAM, 0.1 vCPU
- 100GB трафика/мес
- Нет постоянного диска (ephemeral) - видео пропадают при ре-деплое
- Не засыпает так быстро как Render (Render засыпает через 15 мин)
- Без карты!

## Если хочешь чтобы видео НЕ пропадали бесплатно

Варианты:

**A) Cloudinary 25GB бесплатно (рекомендую)**
- Регистрируешься на https://cloudinary.com/
- Получаешь CLOUD_NAME, API_KEY, API_SECRET
- Я перепишу server.js чтобы грузил туда
- Видео будут навсегда

**B) Supabase Storage 1GB бесплатно**
- https://supabase.com/ -> Storage
- Тоже перепишу server.js

**C) Оставить как есть на Koyeb**
- Для теста хватит, просто не делай частых деплоев

## Что делать дальше

1. Залей бекенд на GitHub
2. Создай сервис на Koyeb (5 мин)
3. Получи URL и вставь в config.js на GitVerse
4. Готово!

Если застрянешь - скинь скрин, помогу.

Хочешь версию с Cloudinary чтобы видео не пропадали? Скажи - соберу за 5 мин.
