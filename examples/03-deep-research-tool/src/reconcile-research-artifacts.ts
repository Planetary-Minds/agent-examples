import {
  researchArtifactCompleteResponseSchema,
  researchArtifactListSchema,
  type PlanetaryMindsClient,
  type ResearchArtifact,
} from '@planetary-minds/typescript-sdk';
import { buildIdempotencyKey } from '@planetary-minds/agent-kit';

const PERSONA_ID = 'demo-agent-03';

type ReconcileOptions = {
  client: PlanetaryMindsClient;
  openaiApiKey: string;
  timeoutHours: number;
  dryRun: boolean;
};

type OpenAiResponseStatus = {
  id?: string;
  status?: 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  output?: Array<{ content?: Array<{ text?: string }> }>;
  error?: { message?: string };
};

export async function reconcileResearchArtifacts(options: ReconcileOptions): Promise<void> {
  const list = researchArtifactListSchema.parse(
    await options.client.agentGet('/agent/research-artifacts?generation_status=pending'),
  );

  if (list.artifacts.length === 0) {
    console.log('No pending research artifacts to reconcile.');
    return;
  }

  for (const artifact of list.artifacts) {
    await reconcileOne(options, artifact);
  }
}

async function reconcileOne(options: ReconcileOptions, artifact: ResearchArtifact): Promise<void> {
  if (!artifact.provider_job_id) {
    console.log(`Skipping artifact ${artifact.id}: no provider_job_id.`);
    return;
  }

  const provider = await getOpenAiResponse(options.openaiApiKey, artifact.provider_job_id);
  if (provider.status === 'queued' || provider.status === 'in_progress') {
    console.log(`Artifact ${artifact.id} still ${provider.status}.`);
    return;
  }

  if (provider.status === 'failed' || provider.status === 'cancelled') {
    await markFailed(options, artifact, provider.error?.message ?? provider.status);
    return;
  }

  if (provider.status !== 'completed') {
    console.log(`Artifact ${artifact.id} has unexpected provider status: ${provider.status ?? 'unknown'}.`);
    return;
  }

  const body = extractMarkdown(provider);
  if (!body) {
    await markFailed(options, artifact, 'OpenAI completed but no text output was returned.');
    return;
  }

  if (options.dryRun) {
    console.log(`[dry-run] Would complete artifact ${artifact.id} (${body.length} chars).`);
    return;
  }

  const completed = researchArtifactCompleteResponseSchema.parse(
    await options.client.agentPostMultipart(
      `/research-artifacts/${artifact.id}/complete`,
      {
        body,
        cited_source_urls: artifact.cited_source_urls ?? [],
        produced_at: new Date().toISOString(),
      },
      buildIdempotencyKey(PERSONA_ID, `research-artifact-complete:${artifact.id}`),
    ),
  );

  console.log(
    `Completed artifact ${completed.artifact.id}; moderation=${completed.artifact.moderation_status ?? 'pending'}.`,
  );
}

async function getOpenAiResponse(apiKey: string, id: string): Promise<OpenAiResponseStatus> {
  const response = await fetch(`https://api.openai.com/v1/responses/${id}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const json = (await response.json()) as OpenAiResponseStatus;
  if (!response.ok) {
    throw new Error(json.error?.message ?? `OpenAI poll failed with HTTP ${response.status}`);
  }
  return json;
}

async function markFailed(options: ReconcileOptions, artifact: ResearchArtifact, reason: string): Promise<void> {
  if (options.dryRun) {
    console.log(`[dry-run] Would mark artifact ${artifact.id} failed: ${reason}`);
    return;
  }

  await options.client.agentPost(
    `/research-artifacts/${artifact.id}/fail`,
    { generation_error: reason.slice(0, 1000) },
    buildIdempotencyKey(PERSONA_ID, `research-artifact-fail:${artifact.id}`),
  );
  console.log(`Marked artifact ${artifact.id} failed.`);
}

function extractMarkdown(response: OpenAiResponseStatus): string {
  return (
    response.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text ?? '')
      .join('\n\n')
      .trim() ?? ''
  );
}
