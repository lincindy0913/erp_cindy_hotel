/**
 * Optimistic locking helper for Prisma.
 *
 * Usage (inside a $transaction):
 *   const record = await tx.paymentOrder.findUnique({ where: { id } });
 *   assertVersion(record, clientVersion); // throws if stale
 *   await tx.paymentOrder.update({
 *     where: { id },
 *     data: { ...changes, version: { increment: 1 } },
 *   });
 *
 * The client must send the `version` field it received from the GET response,
 * and the server rejects the update if the version has changed since.
 */

/**
 * Assert that the record's version matches the expected version.
 * Throws a CONFLICT error if stale.
 *
 * @param {object} record - The DB record with `version` field
 * @param {number|undefined} expectedVersion - The version the client believes is current
 * @param {string} [label] - Human-readable record type for error message
 */
function assertVersion(record, expectedVersion, label = '記錄') {
  if (expectedVersion === undefined || expectedVersion === null) return; // client didn't send version — skip check (backwards compatible)
  const expected = typeof expectedVersion === 'number' ? expectedVersion : parseInt(expectedVersion, 10);
  if (Number.isNaN(expected)) return; // invalid — skip

  if (record.version !== expected) {
    throw new Error(
      `CONFLICT:此${label}已被其他使用者修改（版本 ${record.version} ≠ 預期 ${expected}），請重新載入後再試`
    );
  }
}

module.exports = { assertVersion };
