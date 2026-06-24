import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const paperSchema = z.object({
  title: z.string(),
  url: z.string(),
  year: z.number().nullable(),
  abstract: z.string().nullable(),
});

type RawResponse = {
  data?: Array<{
    title?: string;
    url?: string | null;
    openAccessPdf?: { url?: string | null } | null;
    year?: number | null;
    abstract?: string | null;
  }>;
};

export const semanticScholarSearchTool = createTool({
  id: 'semantic-scholar-search',
  description:
    'Search Semantic Scholar for real academic paper URLs. Never fabricate evidence URLs if this returns no papers.',
  inputSchema: z.object({
    query: z.string().min(3).max(200),
    limit: z.number().int().min(1).max(5).default(3),
  }),
  outputSchema: z.object({
    papers: z.array(paperSchema),
  }),
  execute: async (context) => {
    const url = new URL('https://api.semanticscholar.org/graph/v1/paper/search');
    url.searchParams.set('query', context.query);
    url.searchParams.set('limit', String(context.limit ?? 3));
    url.searchParams.set('fields', 'title,url,openAccessPdf,year,abstract');

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (process.env.SEMANTIC_SCHOLAR_API_KEY) {
      headers['x-api-key'] = process.env.SEMANTIC_SCHOLAR_API_KEY;
    }

    const response = await fetch(url, { headers });
    if (response.status === 429) return { papers: [] };
    if (!response.ok) throw new Error(`Semantic Scholar failed with HTTP ${response.status}`);

    const json = (await response.json()) as RawResponse;
    return {
      papers: (json.data ?? [])
        .map((paper) => ({
          title: paper.title ?? '',
          url: paper.openAccessPdf?.url ?? paper.url ?? '',
          year: paper.year ?? null,
          abstract: paper.abstract ? paper.abstract.slice(0, 900) : null,
        }))
        .filter((paper) => paper.title && /^https?:\/\//i.test(paper.url)),
    };
  },
});
