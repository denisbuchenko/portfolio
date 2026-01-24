import "./styles.css";
import { ParticleApp } from "./app/ParticleApp";
import { createOverlay } from "./ui/overlay";
import { tryCreateWebGL2Context } from "./webgl/context";

// Bootstrap
const overlay = createOverlay();
try {
  const { canvas, gl } = tryCreateWebGL2Context();
  if (!gl) {
    overlay.show(
      "WebGL отключён или недоступен",
      [
        "Не удалось создать WebGL2 контекст (браузер сообщает Disabled/Sandboxed).",
        "",
        "Что попробовать:",
        "- Включить аппаратное ускорение в браузере (Chrome: Настройки → Система → «Использовать аппаратное ускорение»).",
        "- Открыть chrome://gpu и убедиться, что WebGL2 включён.",
        "- Если запускаешь в sandbox/виртуалке/remote desktop — попробуй обычный Chrome/Firefox на хосте.",
        "",
        "Приложение остановлено: без WebGL2 его запустить нельзя."
      ].join("\n")
    );
  } else {
    overlay.hide();
    new ParticleApp({ canvas, gl, overlay });
  }
} catch (e) {
  overlay.show("Ошибка запуска", e instanceof Error ? e.message : String(e));
  // eslint-disable-next-line no-console
  console.error(e);
}


