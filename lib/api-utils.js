/**
 * Shared API utility functions — reduces code duplication across 200+ route files.
 */
import { NextResponse } from 'next/server';

/**
 * Parse pagination parameters from URL search params.
 * @param {URLSearchParams} searchParams
 * @param {{ defaultLimit?: number, maxLimit?: number }} opts
 * @returns {{ page: number, limit: number, skip: number }}
 */
export function parsePagination(searchParams, opts = {}) {
  const { defaultLimit = 50, maxLimit = 200 } = opts;
  const page = Math.max(1, parseInt(searchParams.get('page')) || 1);
  const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit')) || defaultLimit), maxLimit);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

/**
 * Build a paginated JSON response with consistent structure.
 * @param {any[]} data - result array
 * @param {{ page: number, limit: number }} pagination
 * @param {number} total - total record count
 * @returns {NextResponse}
 */
export function paginatedResponse(data, { page, limit }, total) {
  return NextResponse.json({
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

/**
 * Convert Decimal fields to Number and DateTime fields to ISO string.
 * Handles nested objects and arrays.
 * @param {object} record - Prisma record
 * @param {string[]} decimalFields - field names to convert with Number()
 * @param {string[]} dateFields - field names to convert with toISOString()
 * @returns {object}
 */
export function serializeRecord(record, decimalFields = [], dateFields = []) {
  if (!record) return record;
  const result = { ...record };
  for (const f of decimalFields) {
    if (result[f] !== undefined && result[f] !== null) {
      result[f] = Number(result[f]);
    }
  }
  for (const f of dateFields) {
    if (result[f] !== undefined && result[f] !== null) {
      result[f] = result[f] instanceof Date ? result[f].toISOString() : result[f];
    }
  }
  return result;
}

/**
 * Build date range filter for Prisma where clause.
 * @param {string|null} startDate
 * @param {string|null} endDate
 * @returns {object|undefined} - Prisma date filter or undefined if no dates
 */
export function buildDateFilter(startDate, endDate) {
  if (!startDate && !endDate) return undefined;
  const filter = {};
  if (startDate) filter.gte = startDate;
  if (endDate) filter.lte = endDate;
  return filter;
}
