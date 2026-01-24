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

## Примечания по требованиям GPU

Нужен **WebGL2** и расширение `EXT_color_buffer_float` (рендер в float‑текстуры). Если устройство/браузер не поддерживает — появится overlay с ошибкой.


