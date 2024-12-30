import { Pool } from 'pg';

// PostgreSQL connection configuration

export const pool: Pool = new Pool({
  user: process.env.POSTGRES_USER || 'wormuser',
  host: process.env.POSTGRES_HOST || 'localhost',
  database: process.env.POSTGRES_DB || 'wormdb',
  password: process.env.POSTGRES_PASSWORD || 'secret',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
});
