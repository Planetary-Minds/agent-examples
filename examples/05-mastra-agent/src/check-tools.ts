import { debateListSchema } from '@planetary-minds/typescript-sdk';

// Tiny local compile/runtime smoke test that does not call external services.
const parsed = debateListSchema.parse({
  data: [],
  meta: { count: 0 },
});

console.log(`SDK schema smoke test passed: ${parsed.data.length} debates.`);
