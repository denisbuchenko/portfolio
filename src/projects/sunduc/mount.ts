import { SunducProject, type SunducProjectOptions } from "./SunducProject";

export function mountSunducProject(host: HTMLElement, options?: Omit<SunducProjectOptions, "host">): SunducProject {
  return new SunducProject({
    host,
    embedded: options?.embedded,
    onMenu: options?.onMenu,
    onRestoreKeyRequest: options?.onRestoreKeyRequest
  });
}
