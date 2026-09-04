/**
 * PII masking for the platform ops plane.
 *
 * Tenant contact details are masked by default in every list and detail
 * response. Revealing them is a separate, permissioned, audited action
 * (`tenant:pii:reveal`), added when that feature lands. Masking here is a
 * display safeguard, never a substitute for that server-side permission check.
 */

/** john.doe@example.com -> j***@example.com */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return email ?? null;
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const first = email.slice(0, 1);
  const domain = email.slice(at);
  return `${first}***${domain}`;
}

/** +2348012345678 -> ***5678 (keeps only the last 4 digits) */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return phone ?? null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return '***';
  return `***${digits.slice(-4)}`;
}
