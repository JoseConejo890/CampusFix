import express from 'express';
import { defaultIncidentsRepository } from './repositories/incidentsRepository.js';
import { createIncidentsRouter } from './routes/incidents.js';
import { defaultIncidentUpdatesRepository } from './repositories/incidentUpdatesRepository.js';

/**
 * Creates the Express application with configurable repositories for testing.
 */
export function createApp({
  incidentsRepository = { ...defaultIncidentsRepository, ...defaultIncidentUpdatesRepository },
  resolveActorId,
} = {}) {
  const app = express();

  app.use((req, res, next) => {
    const allowedOrigin = process.env.CORS_ORIGIN || '*';
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
    const devAuth = process.env.NODE_ENV === 'development' && process.env.DEV_AUTH_ENABLED === 'true';
    res.setHeader('Access-Control-Allow-Headers', `Content-Type,Authorization${devAuth ? ',X-User-Id' : ''}`);
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    return next();
  });

  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/incidents', createIncidentsRouter(incidentsRepository, { resolveActorId }));

  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

const app = createApp();

export default app;
