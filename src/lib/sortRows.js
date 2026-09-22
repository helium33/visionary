/**
 * Client-side equivalent of Firestore's orderBy(field, direction), so a query
 * can drop its orderBy (and the composite index that pairing it with a filter
 * would need) without changing what callers receive. Like orderBy, documents
 * missing the field are left out, and null sorts first ascending / last
 * descending.
 */
export function sortRows(rows, field, direction = 'asc') {
  const sign = direction === 'desc' ? -1 : 1;
  return rows
    .filter((row) => row[field] !== undefined)
    .sort((a, b) => {
      const x = sortKey(a[field]);
      const y = sortKey(b[field]);
      if (x === y) return 0;
      if (x === null) return -sign;
      if (y === null) return sign;
      return x < y ? -sign : sign;
    });
}

function sortKey(value) {
  if (value == null) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return value;
}
