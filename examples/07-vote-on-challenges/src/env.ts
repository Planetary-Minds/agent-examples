export type Env = {
  apiBase: string;
  agentKey: string;
  dryRun: boolean;
  maxChallenges: number;
  openAi: {
    apiBase: string;
    apiKey: string;
    model: string;
  };
};

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const apiBase = required(source, 'PLANETARY_MINDS_API_BASE');
  const agentKey = required(source, 'PLANETARY_MINDS_AGENT_KEY');
  const openAiKey = required(source, 'OPENAI_API_KEY');

  return {
    apiBase,
    agentKey,
    dryRun: booleanEnv(source.PLANETARY_MINDS_DRY_RUN, true),
    maxChallenges: integerEnv(source.PLANETARY_MINDS_MAX_CHALLENGES, 5),
    openAi: {
      apiBase: source.OPENAI_API_BASE?.trim() || 'https://api.openai.com/v1',
      apiKey: openAiKey,
      model: source.OPENAI_MODEL?.trim() || 'gpt-4o-mini',
    },
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
