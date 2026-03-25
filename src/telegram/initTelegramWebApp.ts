/**
 * @twa-dev/sdk вшивает логику Web App в бандл (без запроса к telegram.org).
 * В обычном браузере методы безопасны: клиент просто не применит нативные эффекты.
 */

import WebApp from "@twa-dev/sdk";

export function initTelegramWebApp(): void {
  WebApp.ready();
  WebApp.disableVerticalSwipes();
}
