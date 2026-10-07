process.env.DATABASE_URL ??= 'postgresql://llmops:test@127.0.0.1:15432/llmops';
process.env.VALKEY_URL ??= 'redis://127.0.0.1:16379/0';
process.env.SESSION_SECRET ??= '01234567890123456789012345678901';
process.env.ENCRYPTION_KEY_B64 ??= Buffer.alloc(32, 1).toString('base64');
process.env.NODE_ENV ??= 'development';
process.env.TEST_DATABASE_URL ??=
  'postgresql://llmops:test@127.0.0.1:15432/llmops_test';
process.env.TEST_VALKEY_URL ??= 'redis://127.0.0.1:16379/15';
