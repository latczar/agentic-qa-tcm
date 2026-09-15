import { fileURLToPath } from 'node:url';

export interface TcmConfig {
  port: number;
  databaseUrl: string;
  testMode: boolean;
  /** Directory holding the YAML seed files. */
  seedDir: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): TcmConfig {
  return {
    port: Number(env.PORT ?? 4000),
    databaseUrl: env.DATABASE_URL ?? 'postgres://aiqa:aiqa@localhost:5432/tcm',
    testMode:
      env.TEST_MODE !== undefined ? env.TEST_MODE === 'true' : env.NODE_ENV !== 'production',
    seedDir: env.SEED_DIR ?? fileURLToPath(new URL('../seed/test-cases/', import.meta.url)),
  };
}
