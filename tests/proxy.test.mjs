import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ChannelWorkerHost } from '../lib/host/worker-host.js'

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port))
  })
}

test('worker sends chat through the account proxy', async () => {
  const requests = []
  const proxy = createServer((req, res) => {
    requests.push({ url: req.url, method: req.method })
    res.writeHead(200, { 'content-type': 'text/event-stream', connection: 'close' })
    res.end(
      `data: ${JSON.stringify({
        choices: [{ index: 0, delta: { content: 'through proxy' }, finish_reason: 'stop' }],
      })}\n\ndata: [DONE]\n\n`,
    )
  })
  proxy.on('connect', (req, clientSocket) => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
    clientSocket.once('data', (chunk) => {
      const text = chunk.toString('utf8')
      const firstLine = text.split('\r\n')[0]
      const [method, path] = firstLine.split(' ')
      requests.push({ url: `http://upstream.invalid${path}`, method })
      const sse = `data: ${JSON.stringify({
        choices: [{ index: 0, delta: { content: 'through proxy' }, finish_reason: 'stop' }],
      })}\n\ndata: [DONE]\n\n`
      clientSocket.write(
        `HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: ${Buffer.byteLength(sse)}\r\nConnection: close\r\n\r\n${sse}`,
      )
      clientSocket.end()
    })
  })
  const port = await listen(proxy)

  const directory = mkdtempSync(join(tmpdir(), 'dsh-hitchfin-proxy-'))
  const packagePath = join(directory, 'mock-channel.mjs')
  writeFileSync(
    packagePath,
    `export const MockPlugin = async () => ({
  auth: {
    provider: 'mock',
    methods: [],
    async loader() {
      return { baseURL: 'http://upstream.invalid/v1' }
    },
  },
  async 'chat.headers'() {},
})
`,
  )

  const host = new ChannelWorkerHost()
  const channel = {
    channelId: 'mock',
    packagePath,
    exportName: 'MockPlugin',
    provider: 'mock',
  }

  try {
    const response = await host.fetch(
      'http://hitchfin.local/v1/chat/completions',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'mock', messages: [], stream: true }),
      },
      {
        channel,
        accountId: 'acct-1',
        auth: { type: 'oauth', access: 'token' },
        model: 'mock',
        proxy: `http://127.0.0.1:${port}`,
      },
    )
    const body = await response.text()
    assert.equal(response.status, 200)
    assert.match(body, /through proxy/)
    assert.equal(requests.length, 1)
    assert.equal(requests[0].url, 'http://upstream.invalid/v1/chat/completions')
    assert.equal(requests[0].method, 'POST')
  } finally {
    await host.stop()
    proxy.closeAllConnections?.()
    await new Promise((resolve) => proxy.close(resolve))
    rmSync(directory, { recursive: true, force: true })
  }
})

test('worker rejects an invalid proxy before sending', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-hitchfin-proxy-'))
  const packagePath = join(directory, 'mock-channel.mjs')
  writeFileSync(
    packagePath,
    `export const MockPlugin = async () => ({
  auth: {
    provider: 'mock',
    methods: [],
    async loader() {
      return { baseURL: 'http://upstream.invalid/v1' }
    },
  },
})
`,
  )

  const host = new ChannelWorkerHost()
  try {
    await assert.rejects(
      host.fetch(
        'http://hitchfin.local/v1/chat/completions',
        { method: 'POST', body: '{}' },
        {
          channel: {
            channelId: 'mock',
            packagePath,
            exportName: 'MockPlugin',
            provider: 'mock',
          },
          accountId: 'acct-1',
          auth: { type: 'oauth', access: 'token' },
          proxy: 'socks5://127.0.0.1:1080',
        },
      ),
      /代理地址|proxy/i,
    )
  } finally {
    await host.stop()
    rmSync(directory, { recursive: true, force: true })
  }
})
