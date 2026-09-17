// Runs before any test module (including the Nest app / Prisma client) loads.
// Loads the repo-root .env for every var the app needs (JWT secrets, S3, CORS, etc.)
// and then forces DATABASE_URL to point at the isolated `abytetex_test` database, so
// the P0 regression suite NEVER touches the `abytetex` dev database — no reset, no
// deletion, no risk to whatever data a developer has in their local dev DB.
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://postgres:12345@localhost:5432/abytetex_test?schema=public';
