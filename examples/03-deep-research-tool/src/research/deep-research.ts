import {
  researchArtifactDispatchResponseSchema,
  type PlanetaryMindsClient,
} from '@planetary-minds/typescript-sdk';
import { buildIdempotencyKey } from '@planetary-minds/agent-kit';

const PERSONA_ID = 'demo-agent-03';

type DispatchOptions = {
  client: PlanetaryMindsClient;
  debateId: string;
  query: string;
  openaiApiKey: string;
  model: string;
  dryRun: boolean;
};

type OpenAiCreatedResponse = {
  id?: string;
  status?: string;
  model?: string;
  error?: { message?: string };
};

export async function dispatchDeepResearch(options: DispatchOptions): Promise<void> {
  if (options.dryRun) {
    console.log('[dry-run] Would dispatch OpenAI deep research with query:');
    console.log(options.query);
    console.log('[dry-run] Would POST /debates/:id/research-artifacts/dispatch');
    return;
  }

  const created = await createOpenAiDeepResearchJob(options);
  if (!created.id) {
    throw new Error(`OpenAI did not return a response id: ${JSON.stringify(created)}`);
  }

  const response = researchArtifactDispatchResponseSchema.parse(
    await options.client.agentPost(
      `/debates/${options.debateId}/research-artifacts/dispatch`,
      {
        origin_tool: 'deepResearch',
        provider: 'openai',
        provider_job_id: created.id,
        provider_model: created.model ?? options.model,
        query: options.query,
        generation_status: 'pending',
      },
      buildIdempotencyKey(PERSONA_ID, `deep-research-dispatch:${options.debateId}`),
    ),
  );

  console.log(
    `Dispatched artifact ${response.artifact.id} (${response.artifact.generation_status}) via ${response.artifact.provider}.`,
  );
}

async function createOpenAiDeepResearchJob(options: DispatchOptions): Promise<OpenAiCreatedResponse> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model,
      background: true,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: options.query,
            },
          ],
        },
      ],
    }),
  });

  const json = (await response.json()) as OpenAiCreatedResponse;
  if (!response.ok) {
    throw new Error(json.error?.message ?? `OpenAI dispatch failed with HTTP ${response.status}`);
  }

  return json;
}
