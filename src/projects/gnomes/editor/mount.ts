import { GnomesDialogueEditorApp } from "./GnomesDialogueEditorApp";

export function mountGnomesDialogueEditor(host: HTMLElement): () => void {
  host.innerHTML = "";
  host.style.display = "block";
  host.style.padding = "0";
  // `#project-picker` по умолчанию имеет класс `launcher` (центрирование карточки).
  // Для полноэкранного редактора нам нужно растянуть layout, иначе могут ломаться размеры/клики графа.
  host.classList.add("launcher--puzzle");

  let app: GnomesDialogueEditorApp | null = null;
  try {
    app = new GnomesDialogueEditorApp({ host });
  } catch (e) {
    host.innerHTML = "";
    const pre = document.createElement("pre");
    pre.style.whiteSpace = "pre-wrap";
    pre.style.padding = "16px";
    pre.style.color = "var(--text)";
    pre.textContent = `Ошибка запуска редактора:\n\n${e instanceof Error ? e.stack ?? e.message : String(e)}`;
    host.appendChild(pre);
  }

  return () => {
    app?.dispose();
    host.classList.remove("launcher--puzzle");
  };
}

