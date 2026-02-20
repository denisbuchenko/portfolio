/**
 * Токен для получения сервиса из контейнера.
 * Реализации могут быть как object-map, так и DI-контейнер — контракт не навязывает.
 */
export type ServiceToken<T> = Readonly<{
  id: string;
  /** Фантомное поле для вывода типов. */
  _T?: T;
}>;

export interface ServiceRegistry {
  get<T>(token: ServiceToken<T>): T;
  tryGet<T>(token: ServiceToken<T>): T | null;
}

