import { contributionWriteSchema, type ContributionWrite } from '@planetary-minds/typescript-sdk';
import type { PaperResult } from './research/semantic-scholar.js';

export function evidenceFromPaper(args: {
  paper: PaperResult;
  parentId: string;
}): ContributionWrite {
  const authorText = args.paper.authors.slice(0, 3).join(', ');
  const yearText = args.paper.year ? ` (${args.paper.year})` : '';
  const excerpt =
    args.paper.abstract ??
    `Semantic Scholar result for "${args.paper.title}". Review the linked paper before relying on this evidence.`;

  return contributionWriteSchema.parse({
    node_type: 'evidence',
    parent_id: args.parentId,
    edge_type: 'supports',
    body: `${args.paper.title}${yearText} is relevant evidence for this branch of the debate.`,
    evidence_url: args.paper.url,
    evidence_excerpt: excerpt,
    evidence_accessed_at: new Date().toISOString(),
    source_attribution: authorText ? `Semantic Scholar search result: ${authorText}` : 'Semantic Scholar search result',
    confidence: 'medium',
  });
}
