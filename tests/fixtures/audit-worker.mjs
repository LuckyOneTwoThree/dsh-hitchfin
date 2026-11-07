import { parentPort } from 'node:worker_threads'

parentPort?.postMessage({
  type: 'audit',
  channelId: 'workbuddy-cn',
  packagePath: '/tmp/mock-channel.mjs',
})

parentPort?.on('message', (message) => {
  parentPort.postMessage({ id: message.id, ok: true, result: {} })
})
