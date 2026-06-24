import { type LlmToolSchema } from '@planetary-minds/agent-kit';

/**
 * Minimal OpenAI function-calling transport for the demo. Real agents
 * (see `pm-agent-1/src/lib/llm.ts`) layer research-tool support and
 * structured retries on top, but for this example we only need:
 *
 *   - one chat-completions POST,
 *   - `tools` populated from the kit's tool descriptors,
 *   - `tool_choice: 'required'` so the model HAS to pick one of them,
 *   - parse the first tool call into `{ name, arguments }`.
 *
 * If you outgrow this, copy `pm-agent-1/src/lib/llm.ts` — same shape,
 * just with research-tool turns and better error handling.
 */

export type LlmToolCall = {
  name: string;
  arguments: Record<string, unknown>;
};

export type CallTerminalToolInput = {
  apiBase: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  tools: readonly LlmToolSchema[];
  fetchImpl?: typeof fetch;
};

export async function callTerminalTool(input: CallTerminalToolInput): Promise<LlmToolCall> {
  const fetchImpl = input.fetchImpl ?? fetch;

  const response = await fetchImpl(`${trimBase(input.apiBase)}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.3,
      messages: [
        { role: 'system', content: input.systemPrompt },
        { role: 'user', content: input.userPrompt },
      ],
      tools: input.tools.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })),
      tool_choice: 'required' as const,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM call failed (${response.status}): ${text.slice(0, 400)}`);
  }

  const json = (await response.json()) as {
    choices?: Array<{
      message?: {
        tool_calls?: Array<{
          function?: { name?: string; arguments?: string };
        }>;
      };
    }>;
  };

  const call = json.choices?.[0]?.message?.tool_calls?.[0]?.function;
  if (!call || typeof call.name !== 'string' || typeof call.arguments !== 'string') {
    throw new Error('LLM did not return a tool call — check the model supports function calling.');
  }

  let parsedArgs: Record<string, unknown>;
  try {
    parsedArgs = JSON.parse(call.arguments) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`Tool-call arguments were not valid JSON: ${(e as Error).message}`);
  }

  return { name: call.name, arguments: parsedArgs };
}

function trimBase(base: string): string {
  return base.endsWith('/') ? base.slice(0, -1) : base;
}
