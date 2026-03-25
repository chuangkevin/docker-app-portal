import 'dotenv/config';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import { createDb } from './db/index';
import { runMigrations } from './db/migrate';
import authPlugin from './plugins/auth';
import adminOnlyPlugin from './plugins/adminOnly';
import healthRoute from './routes/health';
import usersRoute from './routes/users';
import authRoute from './routes/auth';
import servicesRoute from './routes/services';
import pagesRoute from './routes/pages';
import adminRoute from './routes/admin';
import linksRoute from './routes/links';
import { DockerService } from './services/docker';
import { GeminiService } from './services/gemini';
import { initGeminiKeys } from './services/geminiKeys';
import path from 'path';
import fs from 'fs';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DATABASE_PATH = process.env.DATABASE_PATH || './data/app.db';

async function buildServer() {
  const fastify = Fastify({
    logger: true,
  });

  // Ensure data directory exists
  const dbDir = path.dirname(DATABASE_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Setup DB
  const { db } = createDb(DATABASE_PATH);
  await runMigrations(db);

  // Initialize Gemini key pool
  initGeminiKeys(db);

  // Register plugins
  await fastify.register(fastifyCookie);
  await fastify.register(fastifyCors, {
    origin: true,
    credentials: true,
  });
  await fastify.register(authPlugin);
  await fastify.register(adminOnlyPlugin);

  // Register routes
  await fastify.register(healthRoute);
  await fastify.register(usersRoute, { db });
  await fastify.register(authRoute, { db });
  await fastify.register(servicesRoute, { db });
  await fastify.register(pagesRoute, { db });
  await fastify.register(adminRoute, { db });
  await fastify.register(linksRoute, { db });

  return { fastify, db };
}

async function start() {
  const { fastify, db } = await buildServer();

  // Start Docker scan scheduler
  const geminiService = new GeminiService(db);
  const dockerService = new DockerService(db, geminiService);
  dockerService.startScheduler();

  try {
    await fastify.listen({ port: PORT, host: HOST });
    fastify.log.info(`Server listening on ${HOST}:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();

export { buildServer };
