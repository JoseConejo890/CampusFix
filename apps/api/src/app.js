import express from 'express';
import { defaultIncidentsRepository } from './repositories/incidentsRepository.js';
import { createIncidentsRouter } from './routes/incidents.js';

/**
 * Creates the Express application with configurable repositories for testing.
 */
export function createApp({ incidentsRepository = defaultIncidentsRepository } = {}) {
  const app = express();

  app.use((req, res, next) => {
    const allowedOrigin = process.env.CORS_ORIGIN || '*';
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    return next();
  });

  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/incidents', createIncidentsRouter(incidentsRepository));

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

const app = createApp();

export default app;
