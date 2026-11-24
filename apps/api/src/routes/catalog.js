import { Router } from 'express';

/**
 * Builds the Express router for /api/categories and /api/users catalog endpoints.
 */
export function createCatalogRouter(repository) {
  const router = Router();

  router.get('/categories', async (_req, res, next) => {
    try {
      const categories = await repository.listCategories();
      return res.json({ categories });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/users', async (_req, res, next) => {
    try {
      const users = await repository.listUsers();
      return res.json({ users });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
