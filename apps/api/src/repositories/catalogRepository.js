import { getPool } from '../db.js';

/**
 * Lists all incident categories ordered alphabetically.
 */
export async function listCategories() {
  const { rows } = await getPool().query(
    `
      SELECT id, name, description
      FROM categories
      ORDER BY name ASC, id ASC
    `,
  );
  return rows;
}

/**
 * Lists users without exposing password hashes, ordered by role and name.
 */
export async function listUsers() {
  const { rows } = await getPool().query(
    `
      SELECT id, name, email, role
      FROM users
      ORDER BY role ASC, name ASC, id ASC
    `,
  );
  return rows;
}

export const defaultCatalogRepository = {
  listCategories,
  listUsers,
};
