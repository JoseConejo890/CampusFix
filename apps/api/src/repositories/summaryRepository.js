import { getPool } from '../db.js';

/**
 * Computes incident counts grouped by status and priority from PostgreSQL.
 */
export async function getIncidentSummary() {
  const { rows } = await getPool().query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'open')::int AS open,
      COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
      COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved,
      COUNT(*) FILTER (WHERE status = 'closed')::int AS closed,
      COUNT(*) FILTER (WHERE status <> 'closed')::int AS active,
      COUNT(*) FILTER (WHERE priority = 'low')::int AS low_priority,
      COUNT(*) FILTER (WHERE priority = 'medium')::int AS medium_priority,
      COUNT(*) FILTER (WHERE priority = 'high')::int AS high_priority
    FROM incidents
  `);

  const row = rows[0] ?? {
    total: 0,
    open: 0,
    in_progress: 0,
    resolved: 0,
    closed: 0,
    active: 0,
    low_priority: 0,
    medium_priority: 0,
    high_priority: 0,
  };

  return {
    total: row.total,
    open: row.open,
    in_progress: row.in_progress,
    resolved: row.resolved,
    closed: row.closed,
    active: row.active,
    byStatus: {
      open: row.open,
      in_progress: row.in_progress,
      resolved: row.resolved,
      closed: row.closed,
    },
    byPriority: {
      low: row.low_priority,
      medium: row.medium_priority,
      high: row.high_priority,
    },
  };
}

export const defaultSummaryRepository = {
  getIncidentSummary,
};
