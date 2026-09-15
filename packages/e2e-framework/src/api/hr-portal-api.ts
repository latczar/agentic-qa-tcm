import type { APIRequestContext } from '@playwright/test';

export interface HealthResponse {
  status: string;
  app: string;
  seedVersion: number;
  testMode: boolean;
}

/**
 * Thin client for the HR Portal's non-page endpoints.
 * Tests use it to reset state; nothing here drives the user interface.
 */
export class HrPortalApi {
  constructor(private readonly request: APIRequestContext) {}

  /** Restores the seed data. Runs automatically before every test through the resetState fixture. */
  async reset(): Promise<void> {
    const response = await this.request.post('/__test__/reset');
    if (!response.ok()) {
      throw new Error(
        `Could not reset the HR Portal (HTTP ${response.status()}). Is it running with test endpoints on?`,
      );
    }
  }

  /** Liveness and identity of the application under test. */
  async health(): Promise<HealthResponse> {
    const response = await this.request.get('/health');
    if (!response.ok()) throw new Error(`Health check failed with HTTP ${response.status()}`);
    return (await response.json()) as HealthResponse;
  }
}
