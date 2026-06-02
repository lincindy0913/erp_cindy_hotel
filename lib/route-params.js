/**
 * Parse and validate a numeric route segment from Next.js dynamic params.
 *
 * Usage:
 *   const id = await getRouteId(params);
 *
 * Throws 'VALIDATION:無效的 ID' (caught by handleApiError → 400) when the
 * segment is missing, non-numeric, or not a positive integer.
 */
export async function getRouteId(params) {
  const { id } = await params;
  const n = parseInt(id, 10);
  if (Number.isNaN(n) || n <= 0) throw new Error('VALIDATION:無效的 ID');
  return n;
}
