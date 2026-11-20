import { parseId } from '../incidentUpdatesValidation.js';

// X-User-Id is available only in development with explicit opt-in.
export function resolveActorId(req) {
  if (req.user) return parseId(req.user.id);
  if (process.env.NODE_ENV === 'development' && process.env.DEV_AUTH_ENABLED === 'true') {
    return parseId(req.get('X-User-Id'));
  }
  return null;
}
