/**
 * Runtime configuration from environment variables, with defaults that suit local use.
 *
 * Test-support endpoints under /__test__ are ON unless NODE_ENV=production, because this
 * application only exists to be tested. TEST_MODE=true or TEST_MODE=false overrides that.
 */
export interface AppConfig {
  port: number;
  sessionSecret: string;
  testMode: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const testMode =
    env.TEST_MODE !== undefined ? env.TEST_MODE === 'true' : env.NODE_ENV !== 'production';
  return {
    port: Number(env.PORT ?? 3000),
    sessionSecret: env.SESSION_SECRET ?? 'harbour-hr-local-dev-secret',
    testMode,
  };
}
