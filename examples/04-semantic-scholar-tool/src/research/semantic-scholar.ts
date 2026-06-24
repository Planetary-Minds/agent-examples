import { z } from 'zod';

const searchArgsSchema = z.object({
  query: z.string().trim().min(3).max(200),
  limit: z.number().int().min(1).max(5).default(3),
  yearFrom: z.number().int().min(1900).max(2100).optional(),
  openAccessOnly: z.boolean().default(false),
});

export type SemanticScholarSearchArgs = z.infer<typeof searchArgsSchema>;

export type PaperResult = {
  title: string;
  url: string;
  year: number | null;
  authors: string[];
  abstract: string | null;
  citationCount: number | null;
};

type RawPaper = {
  title?: string;
  year?: number | null;
  url?: string | null;
  openAccessPdf?: { url?: string | null } | null;
  citationCount?: number | null;
  abstract?: string | null;
  authors?: Array<{ name?: string }>;
};

type RawResponse = {
  data?: RawPaper[];
};

export async function searchSemanticScholar(
  rawArgs: SemanticScholarSearchArgs,
  options: {
    apiKey?: string;
    minIntervalMs: number;
    fetchImpl?: typeof fetch;
  },
): Promise<PaperResult[]> {
  const args = searchArgsSchema.parse(rawArgs);
  await sleep(options.minIntervalMs);

  const url = new URL('https://api.semanticscholar.org/graph/v1/paper/search');
  url.searchParams.set('query', args.query);
  url.searchParams.set('limit', String(args.limit));
  url.searchParams.set('fields', 'title,year,url,openAccessPdf,citationCount,abstract,authors');
  if (args.yearFrom) {
    url.searchParams.set('year', `${args.yearFrom}-`);
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.apiKey) headers['x-api-key'] = options.apiKey;

  const response = await (options.fetchImpl ?? fetch)(url, { headers });
  if (response.status === 429) {
    console.warn('Semantic Scholar rate limited this request. Try again later or add an API key.');
    return [];
  }
  if (!response.ok) {
    throw new Error(`Semantic Scholar failed with HTTP ${response.status}`);
  }

  const json = (await response.json()) as RawResponse;
  return (json.data ?? [])
    .map((paper) => toPaperResult(paper, args.openAccessOnly))
    .filter((paper): paper is PaperResult => paper !== null);
}

function toPaperResult(paper: RawPaper, openAccessOnly: boolean): PaperResult | null {
  const title = paper.title?.trim();
  const url = paper.openAccessPdf?.url ?? paper.url;
  if (!title || !url || !/^https?:\/\//i.test(url)) return null;
  if (openAccessOnly && !paper.openAccessPdf?.url) return null;

  return {
    title,
    url,
    year: paper.year ?? null,
    authors: (paper.authors ?? []).map((author) => author.name).filter((name): name is string => Boolean(name)),
    abstract: paper.abstract ? trim(paper.abstract, 900) : null,
    citationCount: paper.citationCount ?? null,
  };
}

function trim(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
