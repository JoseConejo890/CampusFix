-- Run after migration on a development/test database. No test rows are retained.
BEGIN;

DO $$
DECLARE
    reporter_id BIGINT;
    technician_id BIGINT;
    administrator_id BIGINT;
    test_category_id BIGINT;
    test_incident_id BIGINT;
    test_email TEXT := 'schema-' || txid_current() || '@example.invalid';
BEGIN
    INSERT INTO users (name, email, password_hash)
    VALUES ('Schema reporter', test_email, 'test-only-not-a-real-password-hash')
    RETURNING id INTO reporter_id;

    INSERT INTO users (name, email, password_hash, role)
    VALUES ('Schema technician', 'tech-' || test_email, 'test-only', 'technician')
    RETURNING id INTO technician_id;

    INSERT INTO users (name, email, password_hash, role)
    VALUES ('Schema admin', 'admin-' || test_email, 'test-only', 'admin')
    RETURNING id INTO administrator_id;

    INSERT INTO categories (name) VALUES ('Schema category ' || txid_current())
    RETURNING id INTO test_category_id;

    INSERT INTO incidents (title, description, location, category_id, reported_by)
    VALUES ('Lamp failure', 'Lamp does not turn on', 'Library', test_category_id, reporter_id)
    RETURNING id INTO test_incident_id;

    IF NOT EXISTS (
        SELECT 1 FROM incidents WHERE id = test_incident_id
        AND status = 'open' AND priority = 'medium' AND assigned_to IS NULL
        AND created_at IS NOT NULL AND updated_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Incident defaults are incorrect';
    END IF;

    -- The initial history entry has no previous state or assignee.
    INSERT INTO incident_updates (incident_id, changed_by, new_status)
    VALUES (test_incident_id, reporter_id, 'open');

    IF NOT EXISTS (
        SELECT 1 FROM incident_updates WHERE incident_id = test_incident_id
        AND changed_by = reporter_id AND previous_status IS NULL
        AND new_status = 'open' AND previous_assigned_to IS NULL
        AND new_assigned_to IS NULL AND created_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Initial history entry is incorrect';
    END IF;

    UPDATE incidents SET assigned_to = technician_id, status = 'in_progress',
        updated_at = CURRENT_TIMESTAMP WHERE id = test_incident_id;
    INSERT INTO incident_updates
        (incident_id, changed_by, previous_status, new_status, new_assigned_to)
    VALUES (test_incident_id, administrator_id, 'open', 'in_progress', technician_id);

    IF NOT EXISTS (
        SELECT 1 FROM incident_updates WHERE incident_id = test_incident_id
        AND changed_by = administrator_id AND created_at IS NOT NULL
        AND new_assigned_to = technician_id
    ) THEN
        RAISE EXCEPTION 'History relation is incorrect';
    END IF;

    BEGIN
        INSERT INTO users (name, email, password_hash)
        VALUES ('Duplicate', ' ' || upper(test_email) || ' ', 'test-only');
        RAISE EXCEPTION 'Duplicate email was accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        UPDATE users SET role = 'invalid' WHERE id = reporter_id;
        RAISE EXCEPTION 'Invalid role was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        UPDATE incidents SET status = 'invalid' WHERE id = test_incident_id;
        RAISE EXCEPTION 'Invalid status was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        UPDATE incidents SET priority = 'invalid' WHERE id = test_incident_id;
        RAISE EXCEPTION 'Invalid priority was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        UPDATE incidents SET category_id = -1 WHERE id = test_incident_id;
        RAISE EXCEPTION 'Missing category was accepted';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        DELETE FROM incidents WHERE id = test_incident_id;
        RAISE EXCEPTION 'Incident history was orphaned';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO categories (name)
        SELECT ' ' || upper(name) || ' ' FROM categories WHERE id = test_category_id;
        RAISE EXCEPTION 'Duplicate category was accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        UPDATE incidents SET title = '   ' WHERE id = test_incident_id;
        RAISE EXCEPTION 'Blank title was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        UPDATE incidents SET reported_by = NULL WHERE id = test_incident_id;
        RAISE EXCEPTION 'Missing reporter was accepted';
    EXCEPTION WHEN not_null_violation THEN NULL;
    END;

    BEGIN
        UPDATE incidents SET assigned_to = -1 WHERE id = test_incident_id;
        RAISE EXCEPTION 'Missing assignee was accepted';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        UPDATE incident_updates SET changed_by = -1 WHERE incident_id = test_incident_id;
        RAISE EXCEPTION 'Missing history author was accepted';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        UPDATE incident_updates SET new_status = 'invalid' WHERE incident_id = test_incident_id;
        RAISE EXCEPTION 'Invalid history status was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        DELETE FROM users WHERE id = reporter_id;
        RAISE EXCEPTION 'Incident reporter was orphaned';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        DELETE FROM categories WHERE id = test_category_id;
        RAISE EXCEPTION 'Incident category was orphaned';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    RAISE NOTICE 'Schema checks passed';
END;
$$;

ROLLBACK;
