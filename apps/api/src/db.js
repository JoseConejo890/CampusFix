import pg from 'pg';

const { Pool } = pg;

let pool;

/**
 * Returns the shared PostgreSQL connection pool, initializing it on first use.
 */
export function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    const useSsl = process.env.DATABASE_SSL === 'true';
    pool = new Pool({
      connectionString,
      ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    });
  }

  return pool;
}

/**
 * Executes a callback inside a PostgreSQL transaction, committing on success
 * and rolling back on any thrown error.
 */
export async function withTransaction(callback, databasePool = getPool()) {
  const client = await databasePool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
