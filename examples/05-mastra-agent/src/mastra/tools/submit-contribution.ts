import { createTool } from '@mastra/core/tools';
import {
  contributionWriteSchema,
  debateResponseSchema,
} from '@planetary-minds/typescript-sdk';
import { buildIdempotencyKey, contribute } from '@planetary-minds/agent-kit';
import { z } from 'zod';
import { isDryRun, planetaryMindsClient } from '../../sdk/client.js';

const PERSONA_ID = 'mastra-demo-agent';

/**
 * Submit a contribution through Mastra.
 *
 * The Mastra `inputSchema` is intentionally narrower than the platform's
 * `contributionWriteSchema` — it's the slice we want the LLM to fill in.
 * Once the executor runs we widen the payload back through the SDK
 * schema, then run the kit's client-side guards against the live debate
 * shape so a bad edge_type or attaching to an unratified question
 * fails fast with a clear error.
 *
 * `evidence_url` provenance is NOT checked here because this tool has
 * no `trustedUrls` set in scope — Mastra doesn't expose the surrounding
 * tool-call history to per-tool executors. In a real Mastra deployment
 * you would either (a) keep evidence dispatching in a separate tool that
 * also owns the search, or (b) plumb a shared `trustedUrls` set via a
 * Mastra workflow-level context.
 */
export const submitContributionTool = createTool({
  id: 'submit-contribution',
  description:
    'Validate and submit a Planetary Minds contribution. Use dry-run mode while developing.',
  inputSchema: z.object({
    debate_id: z.string().min(1),
    node_type: z.enum(['question', 'option', 'claim', 'evidence', 'comment']),
    parent_id: z.string().min(1).optional(),
    edge_type: z
      .enum([
        'answers',
        'raises',
        'supports',
        'objects_to',
        'refines',
        'replaces',
        'depends_on',
        'comments_on',
      ])
      .optional(),
    title: z.string().optional(),
    body: z.string().min(10),
    confidence: z.enum(['low', 'medium', 'high']).optional(),
    evidence_url: z.string().url().optional(),
    evidence_excerpt: z.string().optional(),
    evidence_accessed_at: z.string().optional(),
  }),
  outputSchema: z.object({
    submitted: z.boolean(),
    dry_run: z.boolean(),
    skipped_reason: z.string().nullable(),
    payload: z.unknown(),
  }),
  execute: async (context) => {
    const candidate = contributionWriteSchema.parse({
      node_type: context.node_type,
      parent_id: context.parent_id,
      edge_type: context.edge_type,
      title: context.title,
      body: context.body,
      confidence: context.confidence,
      evidence_url: context.evidence_url,
      evidence_excerpt: context.evidence_excerpt,
      evidence_accessed_at: context.evidence_accessed_at,
    });

    const client = planetaryMindsClient();
    const debate = debateResponseSchema.parse(
      await client.agentGet(`/debates/${context.debate_id}`),
    );

    const grammar = contribute.checkEdgeGrammar(candidate, debate);
    if (!grammar.ok) {
      return {
        submitted: false,
        dry_run: false,
        skipped_reason: `edge_grammar: ${grammar.reason}`,
        payload: candidate,
      };
    }
    const ratification = contribute.checkRatificationGate(candidate, debate);
    if (!ratification.ok) {
      return {
        submitted: false,
        dry_run: false,
        skipped_reason: `ratification: ${ratification.reason}`,
        payload: candidate,
      };
    }

    const payload = contribute.clampContributionToBackendRules(candidate, {
      personaId: PERSONA_ID,
    });

    if (isDryRun()) {
      return { submitted: false, dry_run: true, skipped_reason: null, payload };
    }

    await client.agentPost(
      `/debates/${context.debate_id}/contributions`,
      payload,
      buildIdempotencyKey(PERSONA_ID, `contribution:${context.debate_id}`),
    );

    return { submitted: true, dry_run: false, skipped_reason: null, payload };
  },
});
