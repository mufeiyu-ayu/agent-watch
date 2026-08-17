import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { sendDingTalk, signDingTalkWebhook } from '../plugin/runtime/dingtalk.js';

const webhook = 'https://oapi.dingtalk.com/robot/send?access_token=abc';

test('builds the official timestamp/HMAC-SHA256 DingTalk signature', () => {
  const timestamp = 1_700_000_000_000;
  const secret = 'SEC-test';
  const signed = signDingTalkWebhook(webhook, secret, timestamp);
  const expected = createHmac('sha256', secret).update(`${timestamp}\n${secret}`).digest('base64');
  assert.equal(signed.searchParams.get('timestamp'), String(timestamp));
  assert.equal(signed.searchParams.get('sign'), expected);
});

test('sends markdown and validates DingTalk errcode', async () => {
  let request;
  const fetchImpl = async (url, init) => {
    request = { url: String(url), init };
    return new Response(JSON.stringify({ errcode: 0, errmsg: 'ok' }), { status: 200 });
  };
  await sendDingTalk({ webhook, keyword: 'AgentWatch', secret: 'SEC-test' }, {
    title: 'AgentWatch · Codex 本轮已完成',
    text: '### AgentWatch · Codex 本轮已完成'
  }, { fetchImpl, timestamp: 123 });
  assert.match(request.url, /timestamp=123/);
  const payload = JSON.parse(request.init.body);
  assert.equal(payload.msgtype, 'markdown');
  assert.match(payload.markdown.text, /AgentWatch/);
});

test('rejects messages missing the configured keyword', async () => {
  await assert.rejects(
    sendDingTalk({ webhook, keyword: 'AgentWatch' }, { title: 'Done', text: 'Done' }, { fetchImpl: async () => undefined }),
    /keyword/
  );
});

test('surfaces a DingTalk business error without leaking a webhook', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ errcode: 310000, errmsg: 'keywords not in content' }), { status: 200 });
  await assert.rejects(
    sendDingTalk({ webhook, keyword: 'AgentWatch' }, {
      title: 'AgentWatch test',
      text: 'AgentWatch test'
    }, { fetchImpl }),
    /310000/
  );
});


test('redacts credentials from transport errors', async () => {
  const secret = 'SEC-transport-secret';
  const token = 'super-private-token';
  const privateWebhook = `https://oapi.dingtalk.com/robot/send?access_token=${token}`;
  const fetchImpl = async () => {
    throw new Error(`failed to reach ${privateWebhook} with ${secret}`);
  };
  await assert.rejects(
    sendDingTalk({ webhook: privateWebhook, keyword: 'AgentWatch', secret }, {
      title: 'AgentWatch test',
      text: 'AgentWatch test'
    }, { fetchImpl }),
    (error) => {
      assert.doesNotMatch(error.message, new RegExp(token));
      assert.doesNotMatch(error.message, new RegExp(secret));
      assert.match(error.message, /redacted/);
      return true;
    }
  );
});

test('sends a real HTTP request to a local DingTalk-compatible endpoint', async () => {
  const { createServer } = await import('node:http');
  let received;
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    received = {
      method: request.method,
      url: request.url,
      body: JSON.parse(Buffer.concat(chunks).toString('utf8'))
    };
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ errcode: 0, errmsg: 'ok' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    const localWebhook = `http://127.0.0.1:${address.port}/robot/send?access_token=local`;
    await sendDingTalk({ webhook: localWebhook, keyword: 'AgentWatch', secret: 'SEC-local' }, {
      title: 'AgentWatch local integration',
      text: '### AgentWatch local integration'
    }, { timestamp: 456 });

    assert.equal(received.method, 'POST');
    assert.match(received.url, /timestamp=456/);
    assert.equal(received.body.msgtype, 'markdown');
    assert.match(received.body.markdown.text, /AgentWatch/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
