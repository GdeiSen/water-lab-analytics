# Water Lab Analytics

[![CI](https://github.com/GdeiSen/water-lab-analytics/actions/workflows/ci.yml/badge.svg)](https://github.com/GdeiSen/water-lab-analytics/actions/workflows/ci.yml)
[![Release](https://github.com/GdeiSen/water-lab-analytics/actions/workflows/release.yml/badge.svg)](https://github.com/GdeiSen/water-lab-analytics/actions/workflows/release.yml)
[![GitHub release](https://img.shields.io/github/v/release/GdeiSen/water-lab-analytics)](https://github.com/GdeiSen/water-lab-analytics/releases)

Десктоп-приложение для анализа лабораторных данных из Excel-архивов. Проект собирается как нативное приложение на `Tauri 2`, использует `Rust` для локальной обработки и `Next.js` для интерфейса, хранит данные в `SQLite` и работает полностью на стороне пользователя.

Репозиторий: [github.com/GdeiSen/water-lab-analytics](https://github.com/GdeiSen/water-lab-analytics)

## Что умеет приложение

- импортировать и повторно сканировать архив Excel-файлов
- кэшировать результаты парсинга и ускорять повторную обработку
- строить временные ряды по тестам и объектам
- показывать статистику: `min`, `max`, `avg`, `median`, `stddev`
- экспортировать результаты и графики
- отслеживать изменения файлов архива

## Технологии

- `Tauri 2`
- `Rust`
- `Next.js 14`
- `TypeScript`
- `Tailwind CSS`
- `Zustand`
- `Recharts`
- `SQLite`

## Архитектура

- интерфейс: `/src`
- desktop/backend-часть: `/src-tauri/src`
- конфиг Tauri: `/src-tauri/tauri.conf.json`

## Возможности backend

- IPC-команды для авторизации, выбора архива, сканирования, чтения данных и экспорта
- парсер Excel на `calamine` с нормализацией названий и поддержкой дат в имени файла
- локальная база `SQLite` с миграциями и кэшем
- file watcher на `notify`
- параллельная обработка архива через `rayon`

## Возможности frontend

- экран авторизации и локальные пользовательские сессии
- dashboard с фильтрами и боковыми панелями
- интерактивные графики с управлением диапазоном дат
- статистические summary-блоки
- экспорт данных и изображений графика

## Быстрый старт

### Требования

- `Node.js 20+`
- `npm 10+`
- `Rust stable`

### Локальная разработка

```bash
npm install
npm run tauri:dev
```

### Production build фронтенда

```bash
npm run build
```

### Desktop build

```bash
npm run tauri:build
```

## Проверки

```bash
npm run lint
npm run build
cd src-tauri && cargo test
```

## GitHub Actions

В репозитории настроены workflow'ы:

- `CI` для проверки frontend и Rust-части на push/pull request
- `Release` для сборки Tauri-приложения под `macOS`, `Windows` и `Linux` по git-тегу формата `v*`

Первый release можно выпустить так:

```bash
git tag v1.0.0
git push origin v1.0.0
```

## Авторизация по умолчанию

- логин: `admin`
- пароль: `admin`

При первом запуске пользователь создаётся автоматически в локальной базе.
