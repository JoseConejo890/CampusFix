import { Router } from 'express';

/**
 * Builds the Express router for GET /api/summary.
 */
export function createSummaryRouter(repository) {
  const router = Router();

  router.get('/', async (_req, res, next) => {
    try {
      const summary = await repository.getIncidentSummary();
      return res.json({ summary });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
