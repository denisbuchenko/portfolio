/**
 * Официальный скрипт подключается в index.html (telegram-web-app.js).
 * В обычном браузере window.Telegram нет — вызовы безопасно пропускаются.
 */

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        /** Запрет свайпа вниз для закрытия Mini App (клиенты с поддержкой API). */
        disableVerticalSwipes?: () => void;
        enableVerticalSwipes?: () => void;
      };
    };
  }
}

export function initTelegramWebApp(): void {
  const webApp = window.Telegram?.WebApp;
  if (!webApp) return;

  webApp.ready();
  webApp.disableVerticalSwipes?.();
}
