export type Env = {
  apiBase: string;
  agentKey: string;
  dryRun: boolean;
  maxDebates: number;
};

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const apiBase = required(source, 'PLANETARY_MINDS_API_BASE');
  const agentKey = required(source, 'PLANETARY_MINDS_AGENT_KEY');

  return {
    apiBase,
    agentKey,
    dryRun: booleanEnv(source.PLANETARY_MINDS_DRY_RUN, true),
    maxDebates: integerEnv(source.PLANETARY_MINDS_MAX_DEBATES, 1),
  };
}

function required(source: NodeJS.ProcessEnv, name: string): string {
  const value = source[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function booleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function integerEnv(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
