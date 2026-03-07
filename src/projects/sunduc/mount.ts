import { SunducProject, type SunducProjectOptions } from "./SunducProject";

export function mountSunducProject(host: HTMLElement, options?: Omit<SunducProjectOptions, "host">): () => void {
  const project = new SunducProject({
    host,
    embedded: options?.embedded,
    onMenu: options?.onMenu
  });

  return () => project.dispose();
}
