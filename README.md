# Water Lab Analytics

[![CI](https://github.com/GdeiSen/water-lab-analytics/actions/workflows/ci.yml/badge.svg)](https://github.com/GdeiSen/water-lab-analytics/actions/workflows/ci.yml)
[![Release](https://github.com/GdeiSen/water-lab-analytics/actions/workflows/release.yml/badge.svg)](https://github.com/GdeiSen/water-lab-analytics/actions/workflows/release.yml)
[![GitHub release](https://img.shields.io/github/v/release/GdeiSen/water-lab-analytics)](https://github.com/GdeiSen/water-lab-analytics/releases)

Desktop application for analyzing laboratory data from Excel archives. The app is built with `Tauri 2`, uses `Rust` for local processing, `Next.js` for the UI, and stores data in `SQLite`.

Repository: [github.com/GdeiSen/water-lab-analytics](https://github.com/GdeiSen/water-lab-analytics)

## Features

- import and rescan Excel archives
- cache parsed data for faster repeated analysis
- build time series by test type and object
- show summary statistics: `min`, `max`, `avg`, `median`, `stddev`
- export chart data and chart images
- watch archive files for changes

## Stack

- `Tauri 2`
- `Rust`
- `Next.js 14`
- `TypeScript`
- `Tailwind CSS`
- `Zustand`
- `Recharts`
- `SQLite`

## Project structure

- frontend: `/src`
- desktop backend: `/src-tauri/src`
- Tauri config: `/src-tauri/tauri.conf.json`

## Backend

- IPC commands for authentication, archive selection, scanning, data access, and export
- Excel parsing with `calamine`, including test name normalization and date parsing from filenames
- local `SQLite` storage with migrations and cache support
- file watching with `notify`
- parallel archive processing with `rayon`

## Frontend

- login screen and local user sessions
- dashboard with filters and side panels
- interactive charts with date range controls
- summary statistic cards
- export for data and chart images

## Requirements

- `Node.js 20+`
- `npm 10+`
- `Rust stable`

## Local development

```bash
npm install
npm run tauri:dev
```

## Frontend build

```bash
npm run build
```

## Desktop build

```bash
npm run tauri:build
```

## Checks

```bash
npm run lint
npm run typecheck
npm run build
cd src-tauri && cargo test
```

## GitHub Actions

- `CI` runs frontend checks and Rust tests on pushes and pull requests
- `Release` builds Tauri artifacts for `macOS`, `Windows`, and `Linux` on tags matching `v*`

To create a release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

## Default credentials

- username: `admin`
- password: `admin`

The default user is created automatically on first launch.
