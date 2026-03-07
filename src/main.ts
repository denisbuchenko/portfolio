import "./styles.css";
import { createOverlay } from "./ui/overlay";
import { tryCreateWebGL2Context } from "./webgl/context";
import { ParticleApp } from "./projects/particles";
import { mountPuzzleProject } from "./projects/puzzle/PuzzleProject";
import { mountFruitsProject } from "./projects/fruits";
import { mountGnomesProject } from "./projects/gnomes";
import { mountGnomesDialogueEditor } from "./projects/gnomes/editor";
import { mountCityProject } from "./projects/city";
import { mountOsminogProject } from "./projects/osminog";
import { mountSunducProject } from "./projects/sunduc";
import { ShowcaseMode } from "./showcase/ShowcaseMode";

const overlay = createOverlay();
let showcaseInstance: ShowcaseMode | null = null;

function showPicker(): void {
  const el = document.getElementById("project-picker");
  if (!el) return;

  el.innerHTML = `
    <div class="launcher__card">
      <h2 class="launcher__title">Выбор проекта</h2>
      <div class="launcher__grid">
        <button id="btn-project-showcase" class="btn btn--showcase" type="button">Витрина всех проектов</button>
        <button id="btn-project-sunduc" class="btn" type="button">Сундук</button>
        <button id="btn-project-particles" class="btn" type="button">Частицы</button>
        <button id="btn-project-puzzle" class="btn" type="button">Пазл</button>
        <button id="btn-project-fruits" class="btn" type="button">Фрукты</button>
        <button id="btn-project-gnomes" class="btn" type="button">Гномы</button>
        <button id="btn-project-city" class="btn" type="button">Город</button>
        <button id="btn-project-osminog" class="btn" type="button">Осьминог</button>
        <button id="btn-project-gnomes-editor" class="btn" type="button">Редактор диалогов (Гномы)</button>
      </div>
      <p class="launcher__hint">Выбери проект, который нужно открыть.</p>
    </div>
  `;

  const btnShowcase = document.getElementById("btn-project-showcase") as HTMLButtonElement | null;
  const btnSunduc = document.getElementById("btn-project-sunduc") as HTMLButtonElement | null;
  const btnParticles = document.getElementById("btn-project-particles") as HTMLButtonElement | null;
  const btnPuzzle = document.getElementById("btn-project-puzzle") as HTMLButtonElement | null;
  const btnFruits = document.getElementById("btn-project-fruits") as HTMLButtonElement | null;
  const btnGnomes = document.getElementById("btn-project-gnomes") as HTMLButtonElement | null;
  const btnCity = document.getElementById("btn-project-city") as HTMLButtonElement | null;
  const btnOsminog = document.getElementById("btn-project-osminog") as HTMLButtonElement | null;
  const btnGnomesEditor = document.getElementById("btn-project-gnomes-editor") as HTMLButtonElement | null;
  if (!btnShowcase || !btnSunduc || !btnParticles || !btnPuzzle || !btnFruits || !btnGnomes || !btnCity || !btnOsminog || !btnGnomesEditor) return;

  btnShowcase.addEventListener("click", () => startShowcase());
  btnSunduc.addEventListener("click", () => startSunduc());
  btnParticles.addEventListener("click", () => startParticles());
  btnPuzzle.addEventListener("click", () => startPuzzle());
  btnFruits.addEventListener("click", () => void startFruits());
  btnGnomes.addEventListener("click", () => startGnomes());
  btnCity.addEventListener("click", () => startCity());
  btnOsminog.addEventListener("click", () => startOsminog());
  btnGnomesEditor.addEventListener("click", () => startGnomesDialogueEditor());
}

function hidePicker(): void {
  const el = document.getElementById("project-picker");
  if (!el) return;
  el.innerHTML = "";
  el.style.display = "none";
}

function startParticles(): void {
  hidePicker();
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
      return;
    }
    overlay.hide();
    new ParticleApp({ canvas, gl, overlay });
  } catch (e) {
    overlay.show("Ошибка запуска", e instanceof Error ? e.message : String(e));
    // eslint-disable-next-line no-console
    console.error(e);
  }
}

function startPuzzle(): void {
  hidePicker();
  overlay.hide();
  const el = document.getElementById("project-picker");
  if (!el) return;
  el.style.display = "grid";
  mountPuzzleProject(el);
}

async function startFruits(): Promise<void> {
  hidePicker();
  overlay.hide();
  const el = document.getElementById("project-picker");
  if (!el) return;
  el.style.display = "grid";
  try {
    await mountFruitsProject(el);
  } catch (e) {
    overlay.show("Ошибка запуска", e instanceof Error ? e.message : String(e));
    // eslint-disable-next-line no-console
    console.error(e);
  }
}

function startGnomes(): void {
  hidePicker();
  overlay.hide();
  const el = document.getElementById("project-picker");
  if (!el) return;
  el.style.display = "grid";
  mountGnomesProject(el);
}

function startGnomesDialogueEditor(): void {
  hidePicker();
  overlay.hide();
  const el = document.getElementById("project-picker");
  if (!el) return;
  el.style.display = "block";
  mountGnomesDialogueEditor(el);
}

function startCity(): void {
  hidePicker();
  overlay.hide();
  const el = document.getElementById("project-picker");
  if (!el) return;
  el.style.display = "grid";
  mountCityProject(el);
}

function startOsminog(): void {
  hidePicker();
  overlay.hide();
  const el = document.getElementById("project-picker");
  if (!el) return;
  el.style.display = "grid";
  mountOsminogProject(el);
}

function startSunduc(): void {
  hidePicker();
  overlay.hide();
  const el = document.getElementById("project-picker");
  if (!el) return;
  el.style.display = "block";
  mountSunducProject(el);
}

function startShowcase(): void {
  hidePicker();
  overlay.hide();

  const host = document.getElementById("app");
  if (!host) return;

  showcaseInstance = new ShowcaseMode({
    host,
    onBack: () => {
      showcaseInstance?.dispose();
      showcaseInstance = null;
      showPicker();
    },
  });
}

showPicker();


