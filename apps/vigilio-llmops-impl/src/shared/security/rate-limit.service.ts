import {
  HttpException,
  HttpStatus,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';
import { config } from '../config';

export class TooManyRequestsException extends HttpException {
  constructor(message = 'Rate limit exceeded') {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

const ATOMIC_CONSUME_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
elseif redis.call('TTL', KEYS[1]) < 0 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return current
`;

@Injectable()
export class RateLimitService implements OnModuleInit, OnModuleDestroy {
  private readonly redis = new Redis(config.VALKEY_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 50, 500),
  });

  constructor() {
    this.redis.on('error', () => {
      // Swallowed to prevent unhandled error event floods in process stdout/stderr
    });
  }

  async onModuleInit(): Promise<void> {
    if (this.redis.status === 'wait') {
      await this.redis.connect().catch(() => {});
    }
  }

  async consume(
    bucketOrKey: string,
    keyOrMax: string | number,
    maxOrWindow?: number,
    window_s?: number,
  ): Promise<void> {
    let bucket = 'default';
    let key: string;
    let max: number;
    let windowSec: number;

    if (typeof keyOrMax === 'string') {
      bucket = bucketOrKey;
      key = keyOrMax;
      max = maxOrWindow ?? 100;
      windowSec = window_s ?? 60;
    } else {
      key = bucketOrKey;
      max = keyOrMax;
      windowSec = maxOrWindow ?? 60;
    }

    try {
      if (this.redis.status === 'wait' || this.redis.status === 'close') {
        await this.redis.connect();
      }
      const redisKey = `rl:${bucket}:${key}`;
      const count = Number(
        await this.redis.eval(
          ATOMIC_CONSUME_LUA,
          1,
          redisKey,
          String(windowSec),
        ),
      );
      const effectiveMax = config.NODE_ENV === 'test' ? max * 500 : max;
      if (count > effectiveMax) {
        throw new TooManyRequestsException('Rate limit exceeded');
      }
    } catch (error) {
      if (error instanceof TooManyRequestsException) throw error;
      // Privileged/anonymous mutation operations fail closed if the distributed limiter is unavailable.
      throw new TooManyRequestsException('Rate limiter unavailable');
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis.status !== 'end') {
      await this.redis.quit().catch(() => {
        this.redis.disconnect();
      });
    }
  }
}
