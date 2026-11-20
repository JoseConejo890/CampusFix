import { Router } from 'express';
import { resolveActorId as defaultResolveActorId } from '../auth/resolveActorId.js';
import { HttpError } from '../errors.js';
import { parseId, validateIncidentPatch } from '../incidentUpdatesValidation.js';

export function createIncidentUpdatesRouter(repository, { resolveActorId = defaultResolveActorId } = {}) {
  const router = Router();

  router.use((req, res, next) => {
    const actorId = resolveActorId(req);
    if (!actorId) return res.status(401).json({ error: 'Authentication required' });
    res.locals.actorId = actorId;
    return next();
  });

  function sendError(error, res, next) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    return next(error);
  }

  router.patch('/:id', async (req, res, next) => {
    const incidentId = parseId(req.params.id);
    if (!incidentId) return res.status(400).json({ error: 'Invalid incident id' });
    const validation = validateIncidentPatch(req.body);
    if (validation.errors) {
      return res.status(400).json({ error: 'Validation failed', details: validation.errors });
    }
    try {
      const result = await repository.updateIncident({
        incidentId, actorId: res.locals.actorId, changes: validation.data,
      });
      return res.json(result);
    } catch (error) {
      return sendError(error, res, next);
    }
  });

  router.get('/:id/history', async (req, res, next) => {
    const incidentId = parseId(req.params.id);
    if (!incidentId) return res.status(400).json({ error: 'Invalid incident id' });
    try {
      const updates = await repository.listIncidentHistory({ incidentId, actorId: res.locals.actorId });
      return res.json({ updates });
    } catch (error) {
      return sendError(error, res, next);
    }
  });

  return router;
}
