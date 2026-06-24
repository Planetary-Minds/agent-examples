export type Env = {
  apiBase: string;
  agentKey: string;
  dryRun: boolean;
  openaiApiKey: string;
  deepResearchModel: string;
  timeoutHours: number;
};

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return {
    apiBase: required(source, 'PLANETARY_MINDS_API_BASE'),
    agentKey: required(source, 'PLANETARY_MINDS_AGENT_KEY'),
    dryRun: booleanEnv(source.PLANETARY_MINDS_DRY_RUN, true),
    openaiApiKey: required(source, 'OPENAI_API_KEY'),
    deepResearchModel: source.PLANETARY_MINDS_DEEP_RESEARCH_MODEL ?? 'o4-mini-deep-research',
    timeoutHours: integerEnv(source.OPENAI_DEEP_RESEARCH_TIMEOUT_HOURS, 6),
  };
}

function required(source: NodeJS.ProcessEnv, name: string): string {
  const value = source[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
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
