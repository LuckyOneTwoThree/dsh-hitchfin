// A channel package that behaves like the real ones: a successful live read
// builds a fresh model map, a failed read returns the very object the host
// handed in, and a failed read is remembered inside this plugin instance (the
// same five-minute negative cache Trae keeps in its `readAt` map).
const ID = 'fixture-catalog'

export const FixtureCatalogPlugin = async () => {
  let failed = false
  return {
    config: async (config) => {
      config.provider[ID] = {
        name: 'Fixture Catalog',
        models: {
          'static-a': {
            id: 'static-a',
            name: 'Static A',
            limit: { context: 8000, output: 1000 },
          },
        },
      }
    },
    provider: {
      id: ID,
      async models(provider, { auth } = {}) {
        if (auth?.mode === 'poison') failed = true
        if (failed) return provider.models
        return {
          'live-b': {
            id: 'live-b',
            name: 'Live B',
            limit: { context: 16000, output: 2000 },
            free: true,
            capabilities: { input: { text: true } },
          },
          'live-b-auto': {
            id: 'live-b-auto',
            name: 'Live B',
            limit: { context: 64000, output: 4000 },
          },
          'nameless-one': {
            id: 'nameless-one',
            name: '-',
            limit: { context: 32000, output: 2000 },
          },
          'computer_use_subagent': {
            id: 'computer_use_subagent',
            name: 'computer_use_subagent',
            limit: { context: 8000, output: 1000 },
          },
        }
      },
    },
    auth: { provider: ID },
  }
}
