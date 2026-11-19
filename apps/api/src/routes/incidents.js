import { Router } from 'express';

const VALID_STATUSES = new Set(['open', 'in_progress', 'resolved', 'closed']);
const VALID_PRIORITIES = new Set(['low', 'medium', 'high']);
const POSITIVE_INT_REGEX = /^[1-9]\d*$/;

function parseNonEmptyString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parsePositiveId(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (POSITIVE_INT_REGEX.test(trimmed)) {
      return trimmed;
    }
  }
  return null;
}

/**
 * Validates and normalizes the request body for POST /api/incidents.
 */
function validateCreateIncidentBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: ['Request body must be a JSON object'] };
  }

  const errors = [];
  const title = parseNonEmptyString(body.title);
  const description = parseNonEmptyString(body.description);
  const location = parseNonEmptyString(body.location);
  const categoryId = parsePositiveId(body.categoryId ?? body.category_id);
  const reportedBy = parsePositiveId(body.reportedBy ?? body.reported_by);
  const priority = body.priority === undefined ? 'medium' : body.priority;

  if (!title) {
    errors.push('title is required and must be a non-empty string');
  }
  if (!description) {
    errors.push('description is required and must be a non-empty string');
  }
  if (!location) {
    errors.push('location is required and must be a non-empty string');
  }
  if (!categoryId) {
    errors.push('categoryId is required and must be a positive integer');
  }
  if (!reportedBy) {
    errors.push('reportedBy is required and must be a positive integer');
  }
  if (typeof priority !== 'string' || !VALID_PRIORITIES.has(priority)) {
    errors.push('priority must be one of: low, medium, high');
  }

  if (errors.length > 0) {
    return { errors };
  }

  return {
    data: {
      title,
      description,
      location,
      categoryId,
      reportedBy,
      priority,
    },
  };
}

/**
 * Builds the Express router for /api/incidents endpoints.
 */
export function createIncidentsRouter(repository) {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { status, priority, categoryId } = req.query;

      if (status !== undefined && (typeof status !== 'string' || !VALID_STATUSES.has(status))) {
        return res.status(400).json({ error: 'Invalid status filter' });
      }

      if (priority !== undefined && (typeof priority !== 'string' || !VALID_PRIORITIES.has(priority))) {
        return res.status(400).json({ error: 'Invalid priority filter' });
      }

      let parsedCategoryId;
      if (categoryId !== undefined) {
        parsedCategoryId = parsePositiveId(categoryId);
        if (!parsedCategoryId) {
          return res.status(400).json({ error: 'Invalid categoryId filter' });
        }
      }

      const incidents = await repository.listIncidents({
        status,
        priority,
        categoryId: parsedCategoryId,
      });

      return res.json({ incidents });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/', async (req, res, next) => {
    const validation = validateCreateIncidentBody(req.body);
    if (validation.errors) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors,
      });
    }

    try {
      const incident = await repository.createIncident(validation.data);
      return res.status(201).json({ incident });
    } catch (error) {
      if (error?.code === '23503') {
        return res.status(400).json({
          error: 'Referenced category or user does not exist',
        });
      }
      if (error?.code === '23514') {
        return res.status(400).json({
          error: 'Invalid incident data',
        });
      }
      return next(error);
    }
  });

  return router;
}
