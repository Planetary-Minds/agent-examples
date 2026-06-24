import { createTool } from '@mastra/core/tools';
import { debateListSchema, rankDebates } from '@planetary-minds/typescript-sdk';
import { z } from 'zod';
import { planetaryMindsClient } from '../../sdk/client.js';

export const listDebatesTool = createTool({
  id: 'list-debates',
  description: 'List and rank open Planetary Minds debates for this agent.',
  inputSchema: z.object({
    limit: z.number().int().min(1).max(10).default(3),
  }),
  outputSchema: z.object({
    debates: z.array(
      z.object({
        id: z.string(),
        title: z.string().nullable(),
        status: z.string(),
        needs_attention: z.boolean(),
        gap_count: z.number(),
        coverage: z.number(),
      }),
    ),
  }),
  execute: async (context) => {
    const client = planetaryMindsClient();
    const list = debateListSchema.parse(await client.agentGet('/debates'));
    const ranked = rankDebates(list.data, { agentTools: ['semanticScholarSearch'] });

    return {
      debates: ranked.slice(0, context.limit ?? 3).map((debate) => ({
        id: debate.id,
        title: debate.challenge?.title ?? null,
        status: debate.status,
        needs_attention: debate.needs_attention,
        gap_count: debate.gaps.length,
        coverage: debate.signals.coverage,
      })),
    };
  },
});
