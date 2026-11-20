import { getPool, withTransaction } from '../db.js';

export const INCIDENT_SELECT = `
  SELECT
    i.id,
    i.title,
    i.description,
    i.location,
    i.category_id,
    c.name AS category_name,
    i.reported_by,
    reporter.name AS reported_by_name,
    i.assigned_to,
    assignee.name AS assigned_to_name,
    i.status,
    i.priority,
    i.created_at,
    i.updated_at,
    i.closed_at
  FROM incidents i
  INNER JOIN categories c ON c.id = i.category_id
  INNER JOIN users reporter ON reporter.id = i.reported_by
  LEFT JOIN users assignee ON assignee.id = i.assigned_to
`;

/**
 * Lists incidents ordered from newest to oldest with optional filters.
 */
export async function listIncidents({ status, priority, categoryId } = {}) {
  const conditions = [];
  const values = [];

  if (status) {
    values.push(status);
    conditions.push(`i.status = $${values.length}`);
  }

  if (priority) {
    values.push(priority);
    conditions.push(`i.priority = $${values.length}`);
  }

  if (categoryId) {
    values.push(categoryId);
    conditions.push(`i.category_id = $${values.length}`);
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const sql = `
    ${INCIDENT_SELECT}
    ${whereClause}
    ORDER BY i.created_at DESC, i.id DESC
  `;

  const { rows } = await getPool().query(sql, values);
  return rows;
}

/**
 * Creates a new incident and records its initial open status in incident_updates
 * within the same database transaction.
 */
export async function createIncident({
  title,
  description,
  location,
  categoryId,
  reportedBy,
  priority = 'medium',
}) {
  return withTransaction(async (client) => {
    const insertIncidentSql = `
      INSERT INTO incidents (
        title,
        description,
        location,
        category_id,
        reported_by,
        priority
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `;

    const { rows: insertedRows } = await client.query(insertIncidentSql, [
      title,
      description,
      location,
      categoryId,
      reportedBy,
      priority,
    ]);

    const incidentId = insertedRows[0].id;

    await client.query(
      `
        INSERT INTO incident_updates (
          incident_id,
          changed_by,
          previous_status,
          new_status,
          comment
        )
        VALUES ($1, $2, NULL, 'open', 'Incidencia reportada')
      `,
      [incidentId, reportedBy],
    );

    const { rows } = await client.query(
      `${INCIDENT_SELECT} WHERE i.id = $1`,
      [incidentId],
    );

    return rows[0];
  });
}

export const defaultIncidentsRepository = {
  listIncidents,
  createIncident,
};
