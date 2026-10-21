import mongoose from 'mongoose';
import ApiError from './ApiError.js';

// Shared request-validation helpers. Every amount, quantity and id that changes money or stock is
// checked on the server - values from the browser are never trusted.

export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Case-insensitive "contains" matcher for search boxes. Input is treated as literal text (no regex
// syntax, so no crashes or catastrophic backtracking) and capped in length. Returns null when empty.
export function searchRegex(value, maxLength = 100) {
  const s = (Array.isArray(value) ? value[0] : value);
  if (typeof s !== 'string') return null;
  const t = s.trim().slice(0, maxLength);
  return t ? new RegExp(escapeRegex(t), 'i') : null;
}

export function requireId(value, label) {
  if (!value || !mongoose.isValidObjectId(value)) throw new ApiError(400, `${label} is missing or invalid.`);
  return String(value);
}

// A finite number within [min, max]. `integer` rejects fractions; `exclusiveMin` rejects the minimum itself.
export function number(value, label, { min = 0, max = 1e9, integer = false, exclusiveMin = false } = {}) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new ApiError(400, `${label} must be a number.`);
  if (integer && !Number.isInteger(n)) throw new ApiError(400, `${label} must be a whole number.`);
  if (exclusiveMin ? n <= min : n < min) throw new ApiError(400, `${label} must be ${exclusiveMin ? 'greater than' : 'at least'} ${min}.`);
  if (n > max) throw new ApiError(400, `${label} cannot be more than ${max}.`);
  return n;
}

export const positive = (value, label, opts = {}) => number(value, label, { ...opts, min: 0, exclusiveMin: true });

export function oneOf(value, allowed, label) {
  if (!allowed.includes(value)) throw new ApiError(400, `${label} must be one of: ${allowed.join(', ')}.`);
  return value;
}

// Keeps only the listed keys from a request body (protects against setting fields like balances or roles).
export function pick(body = {}, keys) {
  const out = {};
  keys.forEach((k) => { if (body[k] !== undefined) out[k] = body[k]; });
  return out;
}

export default { escapeRegex, searchRegex, requireId, number, positive, oneOf, pick };

// Like searchRegex but always returns a RegExp (an empty search matches everything). For code paths
// that already checked a search value was supplied.
export function literalRegex(value, maxLength = 100) {
  const s = Array.isArray(value) ? value[0] : value;
  return new RegExp(escapeRegex(String(s ?? '').trim().slice(0, maxLength)), 'i');
}
