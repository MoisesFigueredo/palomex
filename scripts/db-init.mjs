// Cria a tabela do ranking. Uso: DATABASE_URL=... node scripts/db-init.mjs
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
await sql`
  CREATE TABLE IF NOT EXISTS palomex_scores (
    player_id  uuid PRIMARY KEY,
    name       text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 14),
    best_m     integer NOT NULL DEFAULT 0 CHECK (best_m >= 0),
    acorns     integer NOT NULL DEFAULT 0 CHECK (acorns >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    last_post  timestamptz NOT NULL DEFAULT now()
  )`;
await sql`CREATE INDEX IF NOT EXISTS palomex_scores_rank ON palomex_scores (best_m DESC, updated_at ASC)`;
console.log('tabela pronta');
