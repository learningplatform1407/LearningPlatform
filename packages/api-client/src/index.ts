export interface ApiClientConfig {
  baseUrl: string;
}

export function createApiClient(config: ApiClientConfig) {
  // Real fetch/TanStack Query wiring + auth headers land in Phase 1.
  return { baseUrl: config.baseUrl };
}
