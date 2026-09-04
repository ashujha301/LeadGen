import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export type RequestContext = {
  requestId: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function runWithNewRequestId<T>(fn: () => T, requestId: string = randomUUID()): T {
  return runWithRequestContext({ requestId }, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

export function setRequestId(requestId: string): void {
  const existing = storage.getStore();
  if (existing) {
    existing.requestId = requestId;
  }
}
