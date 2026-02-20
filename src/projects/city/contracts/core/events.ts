/**
 * Минимальный контракт шины событий.
 * Реализация может быть sync/async, но контракт — “push событий и подписки”.
 */
export interface EventBus<TEvents extends Record<string, any>> {
  on<TKey extends keyof TEvents>(type: TKey, handler: (event: TEvents[TKey]) => void): Unsubscribe;
  emit<TKey extends keyof TEvents>(type: TKey, event: TEvents[TKey]): void;
}

export type Unsubscribe = () => void;

