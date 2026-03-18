# Particle System: Attractor / Spline (Three.js + TypeScript)

Это реализация ТЗ из `Readme.md`:
- 1000+ частиц (сейчас **1024**, текстура 32×32)
- два режима: **мышь‑аттрактор с вихрем** и **сплайн‑путь (Bezier³)**
- расчёт движения на **GPU** (float render targets + ping‑pong, GLSL ES 3.0)

## Запуск

```bash
npm install
npm run dev
```

Открыть: `http://localhost:3000/`

## Сборка

```bash
npm run build
npm run preview
```

## GitHub Pages

Проект умеет собираться в отдельный клон репозитория `denisbuchenko/denis-portfolio`, который лежит внутри `.pages/` и игнорируется основным git.

Первичная подготовка:

```bash
npm run pages:prepare
```

Сборка для GitHub Pages:

```bash
npm run build:pages
```

Что делает `build:pages`:
- клонирует репозиторий `git@github.com:denisbuchenko/denis-portfolio.git` в `.pages/denis-portfolio`, если клона ещё нет
- делает `git fetch` и `git pull --ff-only`, если клон уже существует и у него есть upstream
- очищает содержимое этого клона, но сохраняет его `.git`
- собирает Vite-проект с `base=/denis-portfolio/` прямо в `.pages/denis-portfolio`

Публикация выполняется вручную:

```bash
cd .pages/denis-portfolio
git status
git add .
git commit -m "Deploy portfolio build"
git push
```

Для репозитория `denisbuchenko/denis-portfolio` в настройках GitHub Pages должен быть выбран source: текущая ветка и корень репозитория (`/`).

## Примечания по требованиям GPU

Нужен **WebGL2** и расширение `EXT_color_buffer_float` (рендер в float‑текстуры). Если устройство/браузер не поддерживает — появится overlay с ошибкой.


