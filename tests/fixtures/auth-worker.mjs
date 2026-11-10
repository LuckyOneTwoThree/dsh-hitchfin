import { parentPort } from 'node:worker_threads'

// A deliberately stuck sign-in callback: the host must reject it on cancel
// instead of waiting for the fifteen-minute RPC timeout.
parentPort?.on('message', (message) => {
  if (message.type === 'authorize') {
    parentPort.postMessage({
      id: message.id,
      ok: true,
      result: { session: 'stuck-session', method: 'auto' },
    })
    return
  }
  if (message.type === 'callback' || message.type === 'cancelAuth') return
  parentPort.postMessage({ id: message.id, ok: true, result: {} })
})
