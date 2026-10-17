// k6 load test for the LLM gateway (mock providers, no API keys needed).
//
//   docker compose up -d
//   docker run --rm --network llm-gateway_default -e BASE_URL=http://gateway:8080 \
//     -v "$PWD/loadtest:/scripts" grafana/k6:1.8.2 run /scripts/k6.js
//
// Three scenarios run back to back:
//   cache_hit  - identical prompt: measures pure gateway overhead (auth,
//                guardrails, rate limit, budget check, cache lookup, audit).
//   upstream   - cache bypass through the mock provider (25 ms simulated
//                model latency): measures routing + accounting overhead.
//   streaming  - SSE responses through the mock provider.
import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://localhost:8080';
const KEY = __ENV.API_KEY || 'sk-gw-demo-perf-9Zx1';
const RATE = Number(__ENV.RATE || 400);
const DURATION = __ENV.DURATION || '30s';

const overhead = new Trend('gateway_overhead_ms', true);

export const options = {
  discardResponseBodies: false,
  scenarios: {
    cache_hit: {
      executor: 'constant-arrival-rate', rate: RATE * 2, timeUnit: '1s', duration: DURATION,
      preAllocatedVUs: 100, maxVUs: 400, exec: 'cacheHit', tags: { scenario: 'cache_hit' },
    },
    upstream: {
      executor: 'constant-arrival-rate', rate: RATE, timeUnit: '1s', duration: DURATION, startTime: '35s',
      preAllocatedVUs: 100, maxVUs: 400, exec: 'upstream', tags: { scenario: 'upstream' },
    },
    streaming: {
      executor: 'constant-arrival-rate', rate: Math.max(10, RATE / 4), timeUnit: '1s', duration: DURATION, startTime: '70s',
      preAllocatedVUs: 50, maxVUs: 200, exec: 'streaming', tags: { scenario: 'streaming' },
    },
  },
  thresholds: {
    'http_req_failed': ['rate<0.01'],
    'http_req_duration{scenario:cache_hit}': ['p(95)<50'],
    'http_req_duration{scenario:upstream}': ['p(95)<150'],
    'http_req_duration{scenario:streaming}': ['p(95)<400'],
    'checks': ['rate>0.99'],
  },
};

const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` };

function body(prompt, stream = false) {
  return JSON.stringify({
    model: 'chat-default',
    stream,
    messages: [
      { role: 'system', content: 'You are a concise assistant for a retail bank.' },
      { role: 'user', content: prompt },
    ],
  });
}

export function setup() {
  // Warm the cache for the cache_hit scenario.
  http.post(`${BASE}/v1/chat/completions`, body('What are your branch opening hours?'), { headers });
}

export function cacheHit() {
  const res = http.post(`${BASE}/v1/chat/completions`, body('What are your branch opening hours?'), { headers });
  check(res, {
    'status 200': (r) => r.status === 200,
    'served from cache': (r) => r.headers['X-Gateway-Cache'] === 'exact',
  });
}

export function upstream() {
  const res = http.post(
    `${BASE}/v1/chat/completions`,
    body(`Summarise ticket #${__VU}-${__ITER}: customer cannot log in to the mobile app.`),
    { headers: Object.assign({ 'Cache-Control': 'no-cache' }, headers) },
  );
  check(res, { 'status 200': (r) => r.status === 200, 'routed upstream': (r) => r.headers['X-Gateway-Provider'] === 'mock-primary' });
  // Mock model latency is 25 ms; the remainder is gateway + network overhead.
  overhead.add(res.timings.duration - 25);
}

export function streaming() {
  const res = http.post(`${BASE}/v1/chat/completions`, body(`Stream an answer ${__VU}-${__ITER}`, true), {
    headers: Object.assign({ 'Cache-Control': 'no-cache' }, headers),
  });
  check(res, {
    'status 200': (r) => r.status === 200,
    'sse done': (r) => typeof r.body === 'string' && r.body.includes('data: [DONE]'),
  });
}
