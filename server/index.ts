import { startServer } from './server';

const port = Number(process.env.PORT ?? 8787);
const s = startServer({
  port,
  staticDir: process.env.STATIC_DIR ?? 'dist',
  dataFile: process.env.DATA_FILE ?? 'data/rooms.json',
});
console.log(`[server] Ancient Warfare Chess listening on :${port} (ws path /ws)`);

const shutdown = async () => {
  await s.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
