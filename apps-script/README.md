# Деплой Apps Script backend

Standalone-проект (не привязан к таблице через Extensions-меню — открывает таблицу по ID напрямую через `getSpreadsheet_()`), так проще автоматизировать и не упираться в блокировку всплывающих окон.

1. Открой [script.google.com/home](https://script.google.com/home) → **New project**.
2. Вставь содержимое `Code.gs` в редактор (замени содержимое `Code.gs` по умолчанию). `SPREADSHEET_ID` уже прописан в коде.
3. Включи файл манифеста: **Настройки проекта (⚙) → "Show appsscript.json manifest file"**, вставь содержимое `appsscript.json`.
4. В таблице создай вкладку **Sales** с колонками `Date | Amount | ROP` и вкладку **Settings** с колонками `Key | Value`, заполни строки `WeeklyPlan` и `TotalMeters` (например `WeeklyPlan=5000000`, `TotalMeters=300`).
5. В редакторе Apps Script открой `Code.gs`, поменяй `var pin = '0000';` в функции `setAdminPin_()` на реальный PIN, выбери эту функцию в выпадающем списке сверху, нажми **Run** один раз. После этого убери литерал PIN из кода (замени обратно на плейсхолдер или удали значение) — PIN уже сохранён в Script Properties и не нужен в исходнике.
6. **Deploy → New deployment → тип Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Скопируй URL вида `https://script.google.com/macros/s/XXXX/exec` — вставь его в `game/public/config.json` (`appsScriptUrl`) и выставь `"useMock": false`.
8. При любой правке `Code.gs` — **Deploy → Manage deployments → Edit → New version**, иначе изменения не попадут в уже опубликованный `/exec` URL.

Проверка: открой `/exec` URL прямо в браузере — должен вернуться JSON без окна входа в Google.
