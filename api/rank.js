// Ranking global. Roda só no servidor: a senha do banco nunca chega ao navegador.
import { neon } from '@neondatabase/serverless';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,12}[\p{L}\p{N}.]$/u;
const MAX_M_PER_S = 16; // a 24 m/s de teto, a corrida soma 14,9 metros por segundo
const MAX_T = 4 * 3600;

function send(res, code, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(code).json(body);
}

async function myRank(sql, player) {
  const r = await sql`
    SELECT s.name, s.best_m, s.acorns,
      CASE WHEN s.best_m > 0 THEN (
        SELECT count(*)::int + 1 FROM palomex_scores o
        WHERE o.best_m > s.best_m OR (o.best_m = s.best_m AND o.updated_at < s.updated_at)
      ) END AS rank
    FROM palomex_scores s WHERE s.player_id = ${player}`;
  return r[0] || null;
}

export default async function handler(req, res) {
  if (!process.env.DATABASE_URL) return send(res, 503, { error: 'indisponivel' });
  const sql = neon(process.env.DATABASE_URL);
  try {
    if (req.method === 'GET') {
      const top = await sql`
        SELECT name, best_m, acorns FROM palomex_scores
        WHERE best_m > 0 ORDER BY best_m DESC, updated_at ASC LIMIT 50`;
      const total = await sql`SELECT count(*)::int AS n FROM palomex_scores WHERE best_m > 0`;
      const player = String(req.query?.player || '');
      const me = UUID.test(player) ? await myRank(sql, player) : null;
      return send(res, 200, { top, total: total[0].n, me });
    }

    if (req.method === 'POST') {
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const player = String(b.player || '');
      const name = String(b.name || '').trim().replace(/\s+/g, ' ');
      const m = Math.floor(Number(b.m) || 0);
      const acorns = Math.floor(Number(b.acorns) || 0);
      const t = Number(b.t) || 0;
      if (!UUID.test(player)) return send(res, 400, { error: 'jogador' });
      if (!NAME.test(name)) return send(res, 400, { error: 'nome' });
      // o resultado precisa caber no tempo jogado
      if (m < 0 || acorns < 0 || t < 0 || t > MAX_T || m > t * MAX_M_PER_S + 30 || acorns > t * 14 + 60) {
        return send(res, 422, { error: 'resultado' });
      }
      const up = await sql`
        INSERT INTO palomex_scores (player_id, name, best_m, acorns)
        VALUES (${player}, ${name}, ${m}, ${acorns})
        ON CONFLICT (player_id) DO UPDATE SET
          name = EXCLUDED.name,
          acorns = CASE WHEN EXCLUDED.best_m > palomex_scores.best_m THEN EXCLUDED.acorns ELSE palomex_scores.acorns END,
          updated_at = CASE WHEN EXCLUDED.best_m > palomex_scores.best_m THEN now() ELSE palomex_scores.updated_at END,
          best_m = GREATEST(palomex_scores.best_m, EXCLUDED.best_m),
          last_post = now()
        WHERE palomex_scores.last_post < now() - interval '1 second'
        RETURNING player_id`;
      if (!up.length) return send(res, 429, { error: 'devagar' });
      return send(res, 200, { me: await myRank(sql, player) });
    }

    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { error: 'metodo' });
  } catch (e) {
    console.error('rank', e.message);
    return send(res, 500, { error: 'falha' });
  }
}
