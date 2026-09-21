# Деплой Apps Script backend

Standalone-проект (не привязан к таблице через Extensions-меню — открывает таблицу по ID напрямую через `getSpreadsheet_()`), так проще автоматизировать и не упираться в блокировку всплывающих окон.

1. Открой [script.google.com/home](https://script.google.com/home) → **New project**.
2. Вставь содержимое `Code.gs` в редактор (замени содержимое `Code.gs` по умолчанию). `SPREADSHEET_ID` уже прописан в коде.
3. Включи файл манифеста: **Настройки проекта (⚙) → "Show appsscript.json manifest file"**, вставь содержимое `appsscript.json`.
4. В таблице создай вкладку **Sales** с колонками `Date | Amount | ROP` и вкладку **Settings** с колонками `Key | Value`, заполни строки `WeeklyPlan` и `TotalMeters` (например `WeeklyPlan=5000000`, `TotalMeters=300`).
5. PIN: в редакторе открой `Code.gs`, поменяй `var pin = '0000';` в функции `setAdminPin_()` на реальный PIN, выбери эту функцию в выпадающем списке сверху, нажми **Run** один раз, затем верни литерал на плейсхолдер (PIN хранится в Script Properties как **соленый хеш**, в исходнике он не нужен). Дальше PIN меняется прямо из админки (вкладка «PIN-код») — этот шаг нужен только для первого запуска или если PIN забыт.
6. **Deploy → New deployment → тип Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Скопируй URL вида `https://script.google.com/macros/s/XXXX/exec` — вставь его в `game/public/config.json` (`appsScriptUrl`) и выставь `"useMock": false`.
8. При любой правке `Code.gs` — **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**, иначе изменения не попадут в уже опубликованный `/exec` URL (URL при этом не меняется). Прежняя версия остаётся в списке версий — откат: тот же диалог, выбрать старую версию.

Проверка: открой `/exec` URL прямо в браузере — должен вернуться JSON без окна входа в Google (в нём есть поля `commands` и `serverNow`).

## API

Один URL. `GET` — публичный, только агрегаты (итоги недели, разбивка по отделам) + свежие «команды анимаций» для экранов. `POST` (тело — JSON, отправляется как `text/plain`, чтобы не было CORS-preflight) — все действия требуют PIN в теле запроса (не в URL):

| `action` | Параметры | Что делает |
|---|---|---|
| `login` | `pin` | проверяет PIN |
| `setPlan` | `pin, plan` | недельный план (также старый формат `{pin, plan}` без `action`) |
| `listSales` | `pin, limit?` (до 200) | последние **непустые** строки «Sales» (заполнено Date/Amount/ROP), новые сверху + итоги недели + план; время в дате показывается, только если оно не 00:00 |
| `addSale` | `pin, rop, amount, date?, requestId?` | пишет оплату в **первую свободную строку после последней продажи** (только ячейки Date/Amount/ROP; колонки D/F, где лежат имена и список для выпадающего ROP, не трогаются). Дата без времени = полночь. Реальная оплата |
| `changePin` | `pin, newPin` | меняет PIN (4–12 цифр); новый хранится хешем `salt$sha256`, старый открытый `ADMIN_PIN` удаляется |
| `command` | `pin, type, args?, requestId?` | просит экраны показать анимацию: `hit {rop, amount}`, `fall {hero, mode}`, `wake`, `growl`, `confetti`, `celebrate` |

Ответ — `{ok: true, ...}` или `{ok: false, error}`: `invalid_pin`, `locked` (+`retryAfterSec`), `bad_request` (+`field`; запрос неверный), `server_error` (+`detail`; неполадка на стороне сервера — нет листа, не взялась блокировка). После 5 неверных PIN за 10 минут API блокируется на 10 минут (счётчик в `CacheService`). Команды хранятся в Script Properties (последние 10, свежее 10 минут), **в таблицу не пишутся**; экраны забирают их при обычном опросе (≤15 с). `requestId` защищает от дублей при повторной отправке (кэш на 10 минут).

## Проверка без деплоя

`Code.gs` можно прогнать локально на имитации сервисов Google (`apps-script/test/gas-harness.mjs`):

```bash
cd game
npm run test:backend      # 22 теста: PIN, блокировка, addSale, listSales, changePin, команды
npm run mock-backend      # тот же Code.gs по http://localhost:8787/exec (PIN 1234, данные в памяти)
```

Для dev-сборки игры и админки адрес подменяется параметром `?backend=http://localhost:8787/exec`.
