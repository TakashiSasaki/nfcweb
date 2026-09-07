import nfcTagSchema from '../data-format/schemas/nfc-tag.schema.json';

/**
 * Authoritative domain utilities for NFC Tag Unique Identifiers (UID).
 * 
 * Canonical representation:
 * - lowercase hexadecimal
 * - deterministic
 * - no presentation-dependent separators (no colons, hyphens, or spaces)
 * - exactly one representation for one identity
 * - length: 8 to 32 hex characters (4 to 16 bytes, even length)
 * 
 * Derived directly from Canonical JSON Schema SSOT:
 * nfc-tag.schema.json properties.uid.pattern
 */

export const CANONICAL_UID_PATTERN = nfcTagSchema.properties.uid.pattern;
export const CANONICAL_UID_REGEX = new RegExp(CANONICAL_UID_PATTERN);

/**
 * Converts any raw or formatted UID string (e.g. "04:5A:B2:3C:9D:80:01" or "04-aa-bb")
 * into canonical lowercase hexadecimal representation without separators.
 */
export function canonicalizeUid(rawUid?: string | null): string {
  if (!rawUid) return '';
  return rawUid.trim().toLowerCase().replace(/[:\-\s]/g, '');
}

/**
 * Shared alias for canonicalizeUid to maintain consistency across the codebase.
 */
export const normalizeUid = canonicalizeUid;

/**
 * Validates whether a given string is in strict canonical UID format:
 * - Lowercase hexadecimal characters only (0-9, a-f)
 * - Between 8 and 32 characters (4 to 16 bytes, even number of digits)
 * - Derived strictly from the Canonical JSON Schema SSOT regex
 */
export function isValidCanonicalUid(uid: string): boolean {
  if (typeof uid !== 'string') return false;
  return CANONICAL_UID_REGEX.test(uid);
}

/**
 * Alias for isValidCanonicalUid.
 */
export const isValidUid = isValidCanonicalUid;

/**
 * Optional presentation helper: formats a canonical UID into colon-separated hex bytes
 * for human readability if requested in UI displays.
 */
export function formatUidForDisplay(uid: string): string {
  const clean = canonicalizeUid(uid);
  if (!clean || clean.length % 2 !== 0) return uid;
  const match = clean.match(/.{1,2}/g);
  return match ? match.join(':') : clean;
}
