import { defineConfig } from "vite";

const PAGES_REPOSITORY_NAME = "denis-portfolio";
const PAGES_OUT_DIR = `.pages/${PAGES_REPOSITORY_NAME}`;

export default defineConfig(({ mode }) => {
  const isPagesBuild = mode === "pages";

  return {
    base: isPagesBuild ? `/${PAGES_REPOSITORY_NAME}/` : "/",
    server: {
      port: 3000
    },
    build: {
      target: "es2022",
      outDir: isPagesBuild ? PAGES_OUT_DIR : "dist",
      // Для Pages-репозитория очистку делаем отдельным скриптом, чтобы не снести `.git`.
      emptyOutDir: !isPagesBuild
    }
  };
});


