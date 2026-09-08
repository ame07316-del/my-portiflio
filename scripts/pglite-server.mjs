/**
 * Exposes the local embedded database over a real TCP Postgres socket.
 * Handy for testing the production `pg` code path (or connecting a GUI) without
 * installing PostgreSQL:
 *
 *   npm run db:serve-local
 *   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres" npm run dev
 */
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const db = await PGlite.create(path.join(process.cwd(), ".data", "pgdata"));
const server = new PGLiteSocketServer({ db, port: 5432, host: "127.0.0.1" });
await server.start();
console.log("PGlite socket server listening on 127.0.0.1:5432");

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  });
}
