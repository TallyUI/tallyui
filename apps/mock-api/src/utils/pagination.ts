export function paginatePage<T>(items: T[], opts: { page: number; perPage: number }) {
  const { page, perPage } = opts;
  const start = (page - 1) * perPage;
  return {
    items: items.slice(start, start + perPage),
    total: items.length,
    totalPages: Math.ceil(items.length / perPage),
  };
}

export function paginateOffset<T>(items: T[], opts: { offset: number; limit: number }) {
  const { offset, limit } = opts;
  return {
    items: items.slice(offset, offset + limit),
    count: items.length,
    offset,
    limit,
  };
}

export function paginateCursor<T>(
  items: T[],
  opts: { limit: number; afterCursor?: string },
  getId: (item: T) => string
) {
  const { limit, afterCursor } = opts;
  let startIndex = 0;

  if (afterCursor) {
    const cursorIndex = items.findIndex((item) => getId(item) === afterCursor);
    startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
  }

  const slice = items.slice(startIndex, startIndex + limit);
  const lastItem = slice[slice.length - 1];

  return {
    items: slice,
    nextCursor: lastItem ? getId(lastItem) : null,
    hasNext: startIndex + limit < items.length,
    hasPrevious: startIndex > 0,
  };
}
