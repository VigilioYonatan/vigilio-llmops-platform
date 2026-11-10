process.env.DATABASE_URL ??=
  'postgresql://llmops:llmops_test_pw@127.0.0.1:15432/llmops_test';
process.env.TEST_DATABASE_URL ??=
  'postgresql://llmops:llmops_test_pw@127.0.0.1:15432/llmops_test';
process.env.VALKEY_URL ??= 'redis://127.0.0.1:16379/15';
process.env.TEST_VALKEY_URL ??= 'redis://127.0.0.1:16379/15';
process.env.NATS_URL ??= 'nats://127.0.0.1:14222';
process.env.TEST_NATS_URL ??= 'nats://127.0.0.1:14222';
process.env.NODE_ENV ??= 'test';
process.env.SESSION_COOKIE_SECURE ??= 'false';
process.env.ENCRYPTION_KEY_B64 ??= Buffer.alloc(32, 4).toString('base64');
