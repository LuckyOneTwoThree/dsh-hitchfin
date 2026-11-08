import { parentPort } from 'node:worker_threads'

parentPort?.postMessage({
  type: 'audit',
  channelId: 'workbuddy-cn',
  packagePath: '/tmp/mock-channel.mjs',
})

parentPort?.on('message', (message) => {
  if (message.type === 'fetch' && message.model === 'crash-mid-stream') {
    parentPort.postMessage({
      id: message.id,
      type: 'head',
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })
    parentPort.postMessage({
      id: message.id,
      type: 'chunk',
      data: Buffer.from('data: {"choices":[]}\n\n').toString('base64'),
    })
    setTimeout(() => process.exit(1), 10)
    return
  }
  parentPort.postMessage({ id: message.id, ok: true, result: {} })
})
