import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const responseTrend = new Trend('response_time');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 100 }, // Ramp up to 100 users
    { duration: '5m', target: 100 }, // Stay at 100 users
    { duration: '2m', target: 200 }, // Ramp up to 200 users
    { duration: '5m', target: 200 }, // Stay at 200 users
    { duration: '2m', target: 500 }, // Ramp up to 500 users
    { duration: '5m', target: 500 }, // Stay at 500 users
    { duration: '2m', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests should be below 500ms
    http_req_failed: ['rate<0.1'],    // Error rate should be below 10%
    errors: ['rate<0.1'],
  },
};

const BASE_URL = 'http://localhost:8080';

// Generate random user data
function generateUser() {
  const userId = Math.random().toString(36).substring(7);
  return {
    email: `user_${userId}@example.com`,
    password: 'password123',
    first_name: 'Test',
    last_name: 'User',
  };
}

export default function () {
  // Test 1: Health check (30% of traffic)
  if (Math.random() < 0.3) {
    const response = http.get(`${BASE_URL}/api/health`);
    check(response, {
      'health check status is 200': (r) => r.status === 200,
      'health check response time < 100ms': (r) => r.timings.duration < 100,
    });
    errorRate.add(response.status !== 200);
    responseTrend.add(response.timings.duration);
  }

  // Test 2: User registration (20% of traffic)
  else if (Math.random() < 0.5) {
    const userData = generateUser();
    const response = http.post(`${BASE_URL}/api/auth/register`, JSON.stringify(userData), {
      headers: { 'Content-Type': 'application/json' },
    });
    check(response, {
      'registration status is 201': (r) => r.status === 201,
      'registration response contains token': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.access_token !== undefined;
        } catch {
          return false;
        }
      },
    });
    errorRate.add(response.status !== 201);
    responseTrend.add(response.timings.duration);
  }

  // Test 3: User login (25% of traffic)
  else if (Math.random() < 0.7) {
    const loginData = {
      email: 'user_test@example.com',
      password: 'password123',
    };
    const response = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify(loginData), {
      headers: { 'Content-Type': 'application/json' },
    });
    check(response, {
      'login status is 200 or 401': (r) => r.status === 200 || r.status === 401,
    });
    errorRate.add(response.status !== 200 && response.status !== 401);
    responseTrend.add(response.timings.duration);
  }

  // Test 4: Metrics endpoint (15% of traffic)
  else if (Math.random() < 0.85) {
    const response = http.get(`${BASE_URL}/api/metrics`);
    check(response, {
      'metrics status is 200': (r) => r.status === 200,
      'metrics contains prometheus format': (r) => r.body.includes('# HELP'),
    });
    errorRate.add(response.status !== 200);
    responseTrend.add(response.timings.duration);
  }

  // Test 5: System info endpoint (10% of traffic)
  else {
    const response = http.get(`${BASE_URL}/api/system`);
    check(response, {
      'system info status is 200': (r) => r.status === 200,
      'system info response is JSON': (r) => {
        try {
          JSON.parse(r.body);
          return true;
        } catch {
          return false;
        }
      },
    });
    errorRate.add(response.status !== 200);
    responseTrend.add(response.timings.duration);
  }

  sleep(1);
}