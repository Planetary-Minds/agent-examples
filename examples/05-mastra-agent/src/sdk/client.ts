import { PlanetaryMindsClient } from '@planetary-minds/typescript-sdk';

export function planetaryMindsClient(): PlanetaryMindsClient {
  const apiBase = process.env.PLANETARY_MINDS_API_BASE;
  const agentKey = process.env.PLANETARY_MINDS_AGENT_KEY;

  if (!apiBase) throw new Error('Missing PLANETARY_MINDS_API_BASE');
  if (!agentKey) throw new Error('Missing PLANETARY_MINDS_AGENT_KEY');

  return new PlanetaryMindsClient(apiBase, agentKey);
}

export function isDryRun(): boolean {
  return ['1', 'true', 'yes', 'on'].includes(
    (process.env.PLANETARY_MINDS_DRY_RUN ?? 'true').toLowerCase(),
  );
}
