import { vi } from "vitest";

// Every real supabase-js query builder is thenable — you can `await` it directly
// (resolves like .select() with no .single()) or chain .single()/.maybeSingle() first.
// This stub supports both without modeling the actual query semantics: each call site
// in the code under test queues up the exact { data, error } it should see next via
// supabaseAdmin.from.mockReturnValueOnce(mockRow(...)), in call order.
export class MockQuery<T = unknown> implements PromiseLike<{ data: T | null; error: unknown }> {
  constructor(private result: { data: T | null; error: unknown }) {}
  select() {
    return this;
  }
  update() {
    return this;
  }
  insert() {
    return this;
  }
  upsert() {
    return this;
  }
  delete() {
    return this;
  }
  eq() {
    return this;
  }
  ilike() {
    return this;
  }
  or() {
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  single() {
    return Promise.resolve(this.result);
  }
  maybeSingle() {
    return Promise.resolve(this.result);
  }
  then<TResult1 = { data: T | null; error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data: T | null; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

export function mockRow<T>(data: T | null, error: unknown = null): MockQuery<T> {
  return new MockQuery<T>({ data, error });
}

export function createSupabaseAdminMock() {
  return {
    from: vi.fn(),
    storage: { from: vi.fn() },
  };
}
