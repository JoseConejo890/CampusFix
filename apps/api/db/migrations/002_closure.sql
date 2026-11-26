BEGIN;

LOCK TABLE incidents IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM incidents WHERE status = 'closed' AND assigned_to IS NULL) THEN
        RAISE EXCEPTION 'Existing closed incidents require an assigned technician'
            USING HINT = 'Review those incidents and assign a technician or reopen them before retrying.';
    END IF;
END;
$$;

UPDATE incidents AS i
SET closed_at = COALESCE(
    (SELECT MAX(u.created_at)
     FROM incident_updates AS u
     WHERE u.incident_id = i.id AND u.new_status = 'closed'
       AND u.previous_status IS DISTINCT FROM 'closed'),
    i.updated_at
)
WHERE i.status = 'closed' AND i.closed_at IS NULL;

UPDATE incidents SET closed_at = NULL
WHERE status <> 'closed' AND closed_at IS NOT NULL;

ALTER TABLE incidents
    ADD CONSTRAINT incidents_closed_requires_assignee
        CHECK (status <> 'closed' OR assigned_to IS NOT NULL),
    ADD CONSTRAINT incidents_closed_at_matches_status
        CHECK ((status = 'closed') = (closed_at IS NOT NULL));

COMMIT;
