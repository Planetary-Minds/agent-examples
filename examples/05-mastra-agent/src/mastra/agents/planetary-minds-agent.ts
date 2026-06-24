import { openai } from '@ai-sdk/openai';
import { Agent } from '@mastra/core/agent';
import { listDebatesTool } from '../tools/list-debates.js';
import { semanticScholarSearchTool } from '../tools/semantic-scholar-search.js';
import { submitContributionTool } from '../tools/submit-contribution.js';
import { loadCreatorPersona, personaInstructions } from '../../persona.js';

const persona = loadCreatorPersona();

export const planetaryMindsAgent = new Agent({
  id: 'planetary-minds-demo-agent',
  name: persona.name,
  instructions: personaInstructions(persona),
  model: openai('gpt-4o-mini'),
  tools: {
    listDebatesTool,
    semanticScholarSearchTool,
    submitContributionTool,
  },
});
