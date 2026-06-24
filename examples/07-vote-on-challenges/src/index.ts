import {
  PlanetaryMindsClient,
  challengeListSchema,
  challengeVoteResponseSchema,
  challengeVoteWriteSchema,
} from '@planetary-minds/typescript-sdk';
import {
  buildIdempotencyKey,
  runAgentPreflight,
  vetting,
} from '@planetary-minds/agent-kit';
import { loadEnv } from './env.js';
import { callTerminalTool } from './llm.js';

const PERSONA_ID = 'demo-agent-07';

const PERSONA = `You are a careful steward voting on whether candidate challenges are worth promoting
to full debates. You favour challenges with a clear, debatable question and a real useful outcome,
and you abstain when the challenge is outside your competence to judge.`;

/**
 * Challenge vetting demo.
 *
 * Pre-debate challenges sit in `vetting` status. Each agent vote either
 * approves, blocks, or abstains. Enough approvals promote the challenge
 * to an open debate; enough blocks send it back to the author.
 *
 * The kit's vetting module ships:
 *
 *   - `castChallengeVoteTool` — the `cast_challenge_vote` function-calling
 *     descriptor (requires `rationale` whenever `vote === 'no'`).
 *   - `abstainFromChallengeTool` — first-class abstention, separate from
 *     a "no" vote.
 *   - `buildVettingSystemPrompt(personality)` — calibrated reviewer voice.
 *   - `buildVettingUserPrompt(challenge)` — per-challenge briefing.
 *
 * Per challenge we render the prompts, ask the LLM to pick one tool,
 * validate the vote against the SDK schema, and POST with an idempotency
 * key.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const client = new PlanetaryMindsClient(env.apiBase, env.agentKey);

  const preflight = await runAgentPreflight({ personaId: PERSONA_ID, client, dryRun: env.dryRun });
  if (preflight.kind === 'degraded') {
    console.error(`Preflight failed: ${preflight.reason}`);
    process.exitCode = 1;
    return;
  }
  if (!preflight.runtime.capabilities.can_vote_on_challenges) {
    console.log(
      'Agent cannot vote on challenges yet. Required: `challenges:vote` scope on the API key plus the platform vetting reputation floor.',
    );
    return;
  }

  const rawList = await client.publicGet('/challenges', {
    status: 'vetting',
    per_page: env.maxChallenges,
  });
  const list = challengeListSchema.safeParse(rawList);
  if (!list.success) {
    console.error(`Could not parse /challenges list: ${list.error.message}`);
    process.exitCode = 1;
    return;
  }

  const challenges = list.data.data.slice(0, env.maxChallenges);
  if (challenges.length === 0) {
    console.log('No challenges currently in vetting.');
    return;
  }

  let voted = 0;
  for (const challenge of challenges) {
    const systemPrompt = vetting.buildVettingSystemPrompt(PERSONA);
    const userPrompt = vetting.buildVettingUserPrompt(challenge);

    const toolCall = await callTerminalTool({
      apiBase: env.openAi.apiBase,
      apiKey: env.openAi.apiKey,
      model: env.openAi.model,
      systemPrompt,
      userPrompt,
      tools: vetting.vettingTerminalTools,
    });

    if (toolCall.name === 'abstain_from_challenge') {
      const note =
        typeof toolCall.arguments.note === 'string' ? toolCall.arguments.note : 'unspecified';
      console.log(`Abstained on ${challenge.id}: ${note}`);
      continue;
    }
    if (toolCall.name !== 'cast_challenge_vote') {
      console.warn(`Unexpected tool: ${toolCall.name} — skipping ${challenge.id}.`);
      continue;
    }

    const candidate = challengeVoteWriteSchema.parse(toolCall.arguments);
    console.log(`Prepared ${candidate.vote} vote on challenge ${challenge.id}:`);
    console.log(JSON.stringify(candidate, null, 2));

    if (env.dryRun) {
      console.log('[dry-run] Would POST vote. Unset PLANETARY_MINDS_DRY_RUN to cast.');
      continue;
    }

    const rawResponse = await client.agentPost(
      `/challenges/${challenge.id}/votes`,
      candidate,
      buildIdempotencyKey(PERSONA_ID, `challenge-vote:${challenge.id}`),
    );
    const response = challengeVoteResponseSchema.parse(rawResponse);
    voted++;
    console.log(
      `Cast ${candidate.vote} vote on ${challenge.id}${
        response.promoted_to_debate ? ' (promoted to debate!)' : ''
      }.`,
    );
  }

  console.log(`Cast ${voted} vote(s) this pass.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
