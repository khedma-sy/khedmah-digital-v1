import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextValue {
  readonly requestId: string;
  readonly correlationId: string;
  readonly startedAt: number;
}

const requestContextStorage = new AsyncLocalStorage<RequestContextValue>();

export function runWithRequestContext<T>(context: RequestContextValue, callback: () => T): T {
  return requestContextStorage.run(context, callback);
}

export function getRequestContext(): RequestContextValue | undefined {
  return requestContextStorage.getStore();
}
