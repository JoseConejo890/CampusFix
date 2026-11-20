import { withTransaction } from '../db.js';
import { HttpError } from '../errors.js';
import { INCIDENT_SELECT } from './incidentsRepository.js';

async function requireActor(client, actorId) {
  const { rows } = await client.query('SELECT id, role FROM users WHERE id = $1 FOR SHARE', [actorId]);
  if (!rows[0]) throw new HttpError(401, 'Unknown authenticated user');
  return rows[0];
}

export function createIncidentUpdatesRepository({ transaction = withTransaction } = {}) {
  return {
    async updateIncident({ incidentId, actorId, changes }) {
      return transaction(async (client) => {
        const actor = await requireActor(client, actorId);
        if (!['admin', 'technician'].includes(actor.role)) {
          throw new HttpError(403, 'Only administrators or assigned technicians can update incidents');
        }

        // Serialize concurrent changes so each history entry has the real previous values.
        const { rows: lockedRows } = await client.query(
          'SELECT id, status, assigned_to FROM incidents WHERE id = $1 FOR UPDATE', [incidentId],
        );
        const previous = lockedRows[0];
        if (!previous) throw new HttpError(404, 'Incident not found');

        const hasAssignment = Object.hasOwn(changes, 'assignedTo');
        if (hasAssignment && actor.role !== 'admin') {
          throw new HttpError(403, 'Only administrators can assign or unassign technicians');
        }
        if (actor.role === 'technician' && previous.assigned_to !== actor.id) {
          throw new HttpError(403, 'Technicians can only update their assigned incidents');
        }

        const nextAssignee = hasAssignment ? changes.assignedTo : previous.assigned_to;
        if (hasAssignment && nextAssignee !== null) {
          const { rows } = await client.query(
            'SELECT id, role FROM users WHERE id = $1 FOR SHARE', [nextAssignee],
          );
          if (!rows[0] || rows[0].role !== 'technician') {
            throw new HttpError(400, 'Assignee must be an existing technician');
          }
        }
        const nextStatus = changes.status ?? previous.status;
        if (nextStatus === 'closed' && nextAssignee === null) {
          throw new HttpError(409, 'Cannot close an incident without an assigned technician');
        }

        if (nextStatus === previous.status && nextAssignee === previous.assigned_to) {
          const { rows } = await client.query(`${INCIDENT_SELECT} WHERE i.id = $1`, [incidentId]);
          return { incident: rows[0], update: null };
        }

        await client.query(`
          UPDATE incidents
          SET status = $2, assigned_to = $3, updated_at = clock_timestamp(),
              closed_at = CASE WHEN $2 = 'closed'
                THEN COALESCE(closed_at, clock_timestamp()) ELSE NULL END
          WHERE id = $1
        `, [incidentId, nextStatus, nextAssignee]);

        const { rows: updates } = await client.query(`
          INSERT INTO incident_updates
            (incident_id, changed_by, previous_status, new_status,
             previous_assigned_to, new_assigned_to, comment, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, clock_timestamp())
          RETURNING *
        `, [incidentId, actor.id, previous.status, nextStatus,
          previous.assigned_to, nextAssignee, changes.comment ?? null]);

        const { rows } = await client.query(`${INCIDENT_SELECT} WHERE i.id = $1`, [incidentId]);
        return { incident: rows[0], update: updates[0] };
      });
    },

    async listIncidentHistory({ incidentId, actorId }) {
      return transaction(async (client) => {
        await requireActor(client, actorId);
        const { rows: incidents } = await client.query('SELECT id FROM incidents WHERE id = $1', [incidentId]);
        if (!incidents[0]) throw new HttpError(404, 'Incident not found');
        const { rows } = await client.query(`
          SELECT u.id, u.incident_id, u.changed_by, actor.name AS changed_by_name,
                 u.previous_status, u.new_status,
                 u.previous_assigned_to, previous_user.name AS previous_assigned_to_name,
                 u.new_assigned_to, next_user.name AS new_assigned_to_name,
                 u.comment, u.created_at
          FROM incident_updates u
          JOIN users actor ON actor.id = u.changed_by
          LEFT JOIN users previous_user ON previous_user.id = u.previous_assigned_to
          LEFT JOIN users next_user ON next_user.id = u.new_assigned_to
          WHERE u.incident_id = $1
          ORDER BY u.created_at, u.id
        `, [incidentId]);
        return rows;
      });
    },
  };
}

export const defaultIncidentUpdatesRepository = createIncidentUpdatesRepository();
