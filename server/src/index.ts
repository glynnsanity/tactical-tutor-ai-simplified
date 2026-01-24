import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import askRoutes from './routes/ask';
import pollRoutes from './routes/poll';
import ingestRoutes from './routes/ingest';
import ingestLocalRoutes from './routes/ingestLocal';
import insightsRoutes from './routes/insights';
import analyzeStreamRoutes from './routes/analyzeStream';
import { env } from './services/env';

const PORT = env.PORT;

async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: true,
  });

  app.get('/health', async () => {
    return { ok: true } as const;
  });

  await app.register(askRoutes);
  await app.register(pollRoutes);
  await app.register(ingestRoutes);
  await app.register(ingestLocalRoutes);
  await app.register(insightsRoutes);
  await app.register(analyzeStreamRoutes);

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    app.log.info(`Server listening on http://localhost:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

buildServer();