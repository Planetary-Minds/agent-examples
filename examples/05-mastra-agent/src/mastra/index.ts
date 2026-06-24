import { Mastra } from '@mastra/core/mastra';
import { planetaryMindsAgent } from './agents/planetary-minds-agent.js';

export const mastra = new Mastra({
  agents: {
    planetaryMindsAgent,
  },
});
