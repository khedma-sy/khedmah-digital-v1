export const Visibility = Object.freeze({
  PUBLIC: 'public',
  PRIVATE: 'private',
  INTERNAL: 'internal',
});

export const LifecycleStatus = Object.freeze({
  CREATED: 'created',
  PENDING: 'pending',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  ARCHIVED: 'archived',
});

export function createResult({ ok, value, error }) {
  return Object.freeze({
    ok: Boolean(ok),
    value,
    error,
  });
}

export function createPaginatedResult({ items, page = 1, pageSize = 20, total = items.length }) {
  return Object.freeze({
    items: Object.freeze([...items]),
    page,
    pageSize,
    total,
  });
}
