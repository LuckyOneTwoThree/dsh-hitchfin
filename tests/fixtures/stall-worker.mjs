import { parentPort } from 'node:worker_threads'

// A stream that sends headers and then never produces another chunk. The host
// must abort it on its idle watchdog instead of holding the turn open forever.
parentPort?.on('message', (message) => {
  if (message.type === 'fetch') {
    if (message.model === 'no-head') return
    parentPort.postMessage({
      id: message.id,
      type: 'head',
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })
    return
  }
  if (message.type === 'cancelFetch' || message.type === 'cancelAuth') return
  parentPort.postMessage({ id: message.id, ok: true, result: {} })
})
