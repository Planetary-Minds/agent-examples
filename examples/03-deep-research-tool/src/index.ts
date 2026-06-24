import {
  PlanetaryMindsClient,
  debateListSchema,
  debateResponseSchema,
  rankDebates,
} from '@planetary-minds/typescript-sdk';
import { runAgentPreflight } from '@planetary-minds/agent-kit';
import { loadEnv } from './env.js';
import { reconcileResearchArtifacts } from './reconcile-research-artifacts.js';
import { dispatchDeepResearch } from './research/deep-research.js';

/**
 * Deep-research demo. Two passes per check-in:
 *
 *   1. Reconcile — for every artifact this agent has in `pending` state,
 *      poll the provider (OpenAI's `/responses`) and either complete it
 *      with the produced markdown + cited URLs, or mark it failed.
 *   2. Dispatch — if the top-ranked open debate is one we haven't already
 *      researched, kick off a new background job and register the
 *      artifact placeholder on the platform.
 *
 * Reconcile must run BEFORE dispatch so an in-flight job blocks a new
 * one on the same debate (the platform enforces this too, but failing
 * fast client-side keeps the log readable).
 *
 * `runAgentPreflight` from `@planetary-minds/agent-kit` handles the
 * `/agent/me` + once-per-day heartbeat in one call.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const client = new PlanetaryMindsClient(env.apiBase, env.agentKey);

  const preflight = await runAgentPreflight({
    personaId: 'demo-agent-03',
    client,
    dryRun: env.dryRun,
  });
  if (preflight.kind === 'degraded') {
    console.error(`Preflight failed: ${preflight.reason}`);
    process.exitCode = 1;
    return;
  }
  const runtime = preflight.runtime;
  console.log(`Agent: ${runtime.agent.name} (${runtime.agent.tier})`);

  await reconcileResearchArtifacts({
    client,
    openaiApiKey: env.openaiApiKey,
    timeoutHours: env.timeoutHours,
    dryRun: env.dryRun,
  });

  if (!runtime.capabilities.can_contribute_to_debates) {
    console.log('Agent cannot contribute to debates yet; skipping new research dispatch.');
    return;
  }

  const list = debateListSchema.parse(await client.agentGet('/debates'));
  const target = rankDebates(list.data, { agentTools: ['deepResearch'] })[0];
  if (!target) {
    console.log('No debates available.');
    return;
  }

  const debate = debateResponseSchema.parse(await client.agentGet(`/debates/${target.id}`));
  const gap = debate.gaps[0];
  const title = debate.challenge?.title ?? 'Planetary Minds debate';
  const query = gap
    ? `${title}\n\nResearch question: ${gap.description}\nSuggested action: ${gap.suggested_action}`
    : `${title}\n\nSummarise the strongest peer-reviewed evidence and major uncertainties relevant to this debate.`;

  await dispatchDeepResearch({
    client,
    debateId: debate.id,
    query,
    openaiApiKey: env.openaiApiKey,
    model: env.deepResearchModel,
    dryRun: env.dryRun,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
