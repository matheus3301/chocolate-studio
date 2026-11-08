import { z } from 'zod';

/** Validate before object schemas can read accessors or prototype-sensitive keys. */
export const safeJsonTreeSchema = z.unknown().superRefine((input, ctx) => {
  const pending = [{ value: input, depth: 0 }];
  const seen = new Set<object>();
  let nodes = 0;
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    if (++nodes > 100_000 || depth > 16) {
      ctx.addIssue({ code: 'custom', message: 'JSON tree exceeds resource limits' });
      return;
    }
    if (value === null || typeof value !== 'object') continue;
    const prototype: unknown = Object.getPrototypeOf(value);
    if (seen.has(value) || Object.getOwnPropertySymbols(value).length !== 0 ||
      (prototype !== null && prototype !== (Array.isArray(value) ? Array.prototype : Object.prototype))) {
      ctx.addIssue({ code: 'custom', message: 'Expected a plain, non-cyclic JSON tree' });
      return;
    }
    seen.add(value);
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (['__proto__', 'constructor', 'prototype'].includes(key) || !('value' in descriptor)) {
        ctx.addIssue({ code: 'custom', message: 'Unsafe property in JSON' });
        return;
      }
      if (Array.isArray(value) && key === 'length') continue;
      pending.push({ value: descriptor.value as unknown, depth: depth + 1 });
    }
  }
});
