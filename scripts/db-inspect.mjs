import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const db = await sql`select current_database() db, current_user usr, version() v`;
console.log(db[0].db, db[0].usr, db[0].v.slice(0, 22));
const t = await sql`select table_schema, table_name from information_schema.tables where table_schema not in ('pg_catalog','information_schema') order by 1,2`;
console.log('tabelas:', t.length, JSON.stringify(t.map((x) => x.table_schema + '.' + x.table_name)));
