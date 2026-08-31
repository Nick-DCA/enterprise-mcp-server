import { executeWithRateLimit } from '../src/services/xero/rateLimiter.js';
import { XeroRateLimitError } from '../src/services/xero/errors.js';

async function testRateLimiter() {
  console.log('====================================================');
  console.log('🧪 Running Rate Limiter Unit Test Suite');
  console.log('====================================================\n');

  let attempts = 0;

  // 1. Test successful execution
  const successResult = await executeWithRateLimit('testSuccess', async () => {
    attempts++;
    return { data: 'ok' };
  });

  if (successResult.data === 'ok' && attempts === 1) {
    console.log('✅ Test 1: Successful execution on first attempt - PASSED');
  } else {
    console.error('❌ Test 1: Failed');
    process.exit(1);
  }

  // 2. Test retry on HTTP 429
  let retryAttempts = 0;
  const retryResult = await executeWithRateLimit(
    'testRetry',
    async () => {
      retryAttempts++;
      if (retryAttempts === 1) {
        const err: any = new Error('Rate limit exceeded');
        err.response = { status: 429, headers: { 'retry-after': '1' } };
        throw err;
      }
      return { data: 'recovered' };
    },
    { maxRetries: 2, initialDelayMs: 100 }
  );

  if (retryResult.data === 'recovered' && retryAttempts === 2) {
    console.log('✅ Test 2: Successful retry after HTTP 429 - PASSED');
  } else {
    console.error('❌ Test 2: Failed');
    process.exit(1);
  }

  // 3. Test max retries exceeded throws XeroRateLimitError
  let maxRetryAttempts = 0;
  try {
    await executeWithRateLimit(
      'testFailMaxRetries',
      async () => {
        maxRetryAttempts++;
        const err: any = new Error('Rate limit exceeded persistent');
        err.response = { status: 429, headers: { 'retry-after': '1' } };
        throw err;
      },
      { maxRetries: 1, initialDelayMs: 50 }
    );
    console.error('❌ Test 3: Expected error but succeeded');
    process.exit(1);
  } catch (err: any) {
    if (err instanceof XeroRateLimitError) {
      console.log('✅ Test 3: Throws XeroRateLimitError after max retries - PASSED');
    } else {
      console.error(`❌ Test 3: Threw unexpected error type: ${err.message}`);
      process.exit(1);
    }
  }

  console.log('\n🎉 ALL RATE LIMITER TESTS PASSED SUCCESSFULLY!');
}

testRateLimiter();
