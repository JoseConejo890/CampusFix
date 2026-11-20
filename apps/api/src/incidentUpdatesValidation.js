const MAX_ID = 9223372036854775807n;
const STATUSES = new Set(['open', 'in_progress', 'resolved', 'closed']);
const FIELDS = new Set(['status', 'assignedTo', 'assigned_to', 'comment']);

// PostgreSQL BIGINT ids remain strings: converting them to Number can lose precision.
export function parseId(value) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) return null;
    return String(value);
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^[1-9]\d{0,18}$/.test(trimmed) || BigInt(trimmed) > MAX_ID) return null;
  return trimmed;
}

export function validateIncidentPatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: ['Request body must be a JSON object'] };
  }
  const errors = [];
  const changes = {};
  for (const key of Object.keys(body)) {
    if (!FIELDS.has(key)) errors.push(`Unknown field: ${key}`);
  }
  if (Object.hasOwn(body, 'assignedTo') && Object.hasOwn(body, 'assigned_to')) {
    errors.push('Use either assignedTo or assigned_to, not both');
  }
  if (Object.hasOwn(body, 'status')) {
    if (!STATUSES.has(body.status)) {
      errors.push('status must be one of: open, in_progress, resolved, closed');
    } else changes.status = body.status;
  }
  if (Object.hasOwn(body, 'assignedTo') || Object.hasOwn(body, 'assigned_to')) {
    const value = Object.hasOwn(body, 'assignedTo') ? body.assignedTo : body.assigned_to;
    const id = value === null ? null : parseId(value);
    if (value !== null && id === null) {
      errors.push('assignedTo must be a positive BIGINT id or null');
    } else changes.assignedTo = id;
  }
  if (Object.hasOwn(body, 'comment')) {
    if (typeof body.comment !== 'string' || !body.comment.trim() || body.comment.trim().length > 2000) {
      errors.push('comment must be a non-empty string of at most 2000 characters');
    } else changes.comment = body.comment.trim();
  }
  if (!Object.hasOwn(body, 'status') && !Object.hasOwn(body, 'assignedTo') && !Object.hasOwn(body, 'assigned_to')) {
    errors.push('Provide status or assignedTo');
  }
  return errors.length ? { errors } : { data: changes };
}
