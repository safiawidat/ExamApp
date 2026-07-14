import pg from 'pg';

const { Pool } = pg;

export class PostgresExamRepository {
  constructor({ connectionString, ssl }) {
    this.pool = new Pool({
      connectionString,
      ssl: ssl ? { rejectUnauthorized: false } : false,
    });
  }

  async getAll() {
    const result = await this.pool.query(
      'SELECT id, title, description, status FROM exams ORDER BY id',
    );

    return result.rows;
  }

  async create({ title, description }) {
    const result = await this.pool.query(
      `INSERT INTO exams (title, description, status)
       VALUES ($1, $2, $3)
       RETURNING id, title, description, status`,
      [title, description, 'draft'],
    );

    return result.rows[0];
  }
}
