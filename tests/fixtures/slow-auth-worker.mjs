import { parentPort } from 'node:worker_threads'

// Sign-ins live in worker state, and a callback takes longer than the host's
// post-cancel recycle window. This makes a recycled worker observable: a
// session issued before the recycle is refused by the generation check.
let next = 1

parentPort?.on('message', (message) => {
  if (message.type === 'authorize') {
    parentPort.postMessage({
      id: message.id,
      ok: true,
      result: { session: `slow-${next++}`, method: 'auto' },
    })
    return
  }
  if (message.type === 'callback') {
    setTimeout(() => {
      parentPort.postMessage({
        id: message.id,
        ok: true,
        result: { provider: 'slow', auth: { type: 'oauth', access: 'slow-access' } },
      })
    }, 800)
    return
  }
  if (message.type === 'cancelAuth') return
  parentPort.postMessage({ id: message.id, ok: true, result: {} })
})
