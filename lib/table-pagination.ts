export const TABLE_PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_TABLE_PAGE_SIZE = 25;

export function paginateTable<T>(rows: readonly T[], requestedPage = 1, pageSize = DEFAULT_TABLE_PAGE_SIZE) {
  const size = (TABLE_PAGE_SIZES as readonly number[]).includes(pageSize) ? pageSize : DEFAULT_TABLE_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(totalPages, Math.max(1, Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 1));
  const offset = (page - 1) * size;
  return { rows: rows.slice(offset, offset + size), page, pageSize: size, totalPages, total: rows.length, from: rows.length ? offset + 1 : 0, to: Math.min(offset + size, rows.length) };
}
