# LolTube - Деплой на Fly.io с постоянным диском (видео не пропадут)

Твой IP 192.168.0.108 - локально, а это гайд чтобы залить бекенд в интернет бесплатно и навсегда.

## Что получишь
- URL типа `https://loltube-grapescript.fly.dev` - бекенд в интернете 24/7
- Диск 3GB для видео + 1GB для базы - видео НЕ пропадут при рестарте
- Фронт остается на https://grapescript.gitverse.site/loltube/ - только поменяешь config.js

## Шаг 0 - Подготовь проект

Скачай архив `loltube-deploy-flyio.zip` (я собрал) или используй папку с:
- `server.js` (уже поддерживает `process.env.PORT`)
- `package.json`
- `public/` (фронт v5.0 с F9 анимациями и индикатором)
- `Dockerfile` (есть)
- `fly.toml` (есть, настроен)

## Шаг 1 - Установи flyctl

**Windows (PowerShell от имени админа):**
```powershell
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```
Закрой и открой PowerShell заново, проверь:
```powershell
flyctl version
```

**Если не работает - скачай вручную:** https://github.com/superfly/flyctl/releases

## Шаг 2 - Логин

```powershell
flyctl auth login
```
Откроется браузер, войди через GitHub.

## Шаг 3 - Создай приложение (не деплой еще)

В папке проекта (где `fly.toml` и `server.js`):

```powershell
cd C:\LolTube
# или cd "C:\Users\Zamalutdinov Danis\Desktop\Projects\LolTubeServer"

flyctl launch --name loltube-grapescript --region ams --no-deploy
```
- `loltube-grapescript` - имя приложения, должно быть уникальным. Если занято, попробуй `loltube-grapescript-123` или `loltube-danis`
- `ams` - Амстердам, близко к России, быстрый
- `--no-deploy` - пока не деплоим

Если спросит про Postgres/Redis - выбери No.

## Шаг 4 - Создай постоянные диски (ВАЖНО! Чтобы видео не пропадали)

```powershell
flyctl volumes create loltube_uploads --region ams --size 3 --app loltube-grapescript
flyctl volumes create loltube_data --region ams --size 1 --app loltube-grapescript
```

- `loltube_uploads` 3GB - для видео, превью, аватарок
- `loltube_data` 1GB - для базы `db.json` (пользователи, лайки, комменты)

Если пишет `volume already exists` - ок.

Проверь:
```powershell
flyctl volumes list --app loltube-grapescript
```

## Шаг 5 - Деплой

```powershell
flyctl deploy
```

Будет собираться 2-3 минуты (первый раз долго). В конце увидишь:
```
--> v0 deployed successfully
--> Monitoring...
--> https://loltube-grapescript.fly.dev
```

Твой бекенд теперь в интернете!

Проверь:
```powershell
curl https://loltube-grapescript.fly.dev/api/config
```
Должен вернуть `{"name":"LolTube","version":"2.0",...}`

## Шаг 6 - Подключи фронт

1. Открой `public/config.js` (или `config.js` в корне фронта)
2. Пропиши URL бекенда:

```js
window.LOLTUBE_API_BASE = 'https://loltube-grapescript.fly.dev';
```

3. Перезалей 4 файла на GitVerse в репо `loltube`:
- `index.html`
- `style.css`
- `app.js`
- `config.js`

4. Подожди 2 мин, открой https://grapescript.gitverse.site/loltube/ + Ctrl+F5

Индикатор должен стать зеленым:
`БЕКЕНД: ОНЛАЙН • https://loltube-grapescript.fly.dev • v2.0`

## Шаг 7 - Проверка видео

- Загрузи видео через сайт
- Перезапусти бекенд: `flyctl apps restart loltube-grapescript`
- Видео должно остаться (потому что диск постоянный)

Если видео пропадает - значит volume не подключился, проверь `fly.toml` - там должны быть 2 блока `[[mounts]]`.

## Полезные команды

```powershell
flyctl logs --app loltube-grapescript          # логи
flyctl status --app loltube-grapescript        # статус
flyctl volumes list --app loltube-grapescript  # диски
flyctl apps restart loltube-grapescript        # рестарт
flyctl deploy                                  # пере-деплой после изменений
flyctl open --app loltube-grapescript          # открыть в браузере
```

## Лимиты Fly.io бесплатно

- 3 машины shared-cpu-1x 256MB бесплатно (нам хватит 1 машины 512MB - тоже в лимит)
- 3GB persistent volume бесплатно (мы используем 3+1=4GB, но 1GB для data можно сделать 1GB - в сумме 4GB, чуть выше лимита, но первые месяцы бесплатно, потом $0.15/GB. Можно сделать 2GB + 1GB = 3GB чтобы влезть)
- Трафик 160GB/мес бесплатно - хватит
- Не засыпает, в отличие от Render

Если хочешь влезть в 3GB бесплатно - сделай:
```powershell
flyctl volumes create loltube_uploads --size 2
flyctl volumes create loltube_data --size 1
```
Итого 3GB.

## Что делать если имя занято

Если `loltube-grapescript` занято:
```powershell
flyctl launch --name loltube-grapescript-danis-123 --region ams --no-deploy
```
И везде замени имя.

## Если хочешь Cloudinary/Supabase для видео (чтобы вообще не париться)

Скажи - я перепишу `server.js` на `server-cloudinary.js` - тогда видео будут в Cloudinary 25GB бесплатно и вообще не пропадут даже без volume.

Готово! Вопросы - пиши.
