# Water Lab Analytics (Tauri + Next.js)

Десктоп-приложение для парсинга Excel-архива лабораторных данных, локального кэширования в SQLite и визуализации аналитики по танкам.

## Реализовано

- `Tauri 2 + Rust` backend с IPC командами:
  - `login/logout/whoami`
  - `select_archive`, `rescan_archive`, `get_file_list`
  - `get_test_types`, `get_chart_data`, `get_file_details`
  - `get_setting`, `set_setting`, `get_last_archive_path`
- Парсер Excel на `calamine`:
  - динамический поиск строки заголовка с танками
  - поддержка дат в имени `DD_MM_YYYY` и `DD.MM.YYYY`
  - нормализация названий тестов + алиасы (`aliases.json`)
  - warning/error классификация
- Параллельная обработка архива (`rayon`) + SHA-256 кэш
- SQLite слой (`rusqlite`) с миграциями и индексами
- File watcher (`notify`) + Tauri events:
  - `parse:progress`
  - `parse:complete`
  - `file:changed`
  - `file:error`
- Frontend (`Next.js + TypeScript + Tailwind + Zustand + Recharts`):
  - `LoginScreen`
  - Dashboard с правым sidebar
  - фильтр файлов, детали файла, счётчики статусов
  - интерактивный график, brush/zoom, выбор танков
  - DateRangePicker (пресеты, ручной ввод, двойной календарь, range slider)
  - статистика (min/max/avg/median/stddev)
  - экспорт CSV и PNG

## Структура

- Frontend: `src/`
- Backend: `src-tauri/src/`

## Локальный запуск

1. Установить Node.js 20+ и npm.
2. Установить Rust toolchain (stable).
3. Установить зависимости:
   - `npm install`
4. Запустить приложение:
   - `npm run tauri:dev`

## Дефолтная авторизация

- Логин: `admin`
- Пароль: `admin`

На первом запуске пользователь создаётся автоматически в SQLite.

## Проверки

- `cargo check` (в `src-tauri`) — OK
- `cargo test` (в `src-tauri`) — OK

Проверка `npm`/`next` в текущем окружении не выполнялась, так как отсутствует Node.js.
