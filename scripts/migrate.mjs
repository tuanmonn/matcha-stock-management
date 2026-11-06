import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) { console.error('Set DATABASE_URL first.'); process.exit(1); }
const sql = neon(url);
const text = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
// shortcut: splits on ";" so schema.sql must not contain semicolons inside strings or bodies.
const statements = text.split(';').map(s => s.trim()).filter(Boolean);
await sql.transaction(statements.map(s => sql.query(s)));
console.log(`Ran ${statements.length} statements.`);
