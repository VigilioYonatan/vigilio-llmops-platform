import {
  AckPolicy,
  connect,
  DiscardPolicy,
  RetentionPolicy,
  StorageType,
} from 'nats';
import { config } from '../shared/config';
export async function platformSetup() {
  const nc = await connect({ servers: config.NATS_URL });
  try {
    const jsm = await nc.jetstreamManager();
    try {
      await jsm.streams.info('VIGILIO');
    } catch {
      await jsm.streams.add({
        name: 'VIGILIO',
        subjects: ['events.>'],
        storage: StorageType.File,
        retention: RetentionPolicy.Limits,
        max_age: 14 * 24 * 60 * 60 * 1_000_000_000,
        discard: DiscardPolicy.Old,
      });
    }
    try {
      await jsm.streams.info('VIGILIO_DLQ');
    } catch {
      await jsm.streams.add({
        name: 'VIGILIO_DLQ',
        subjects: ['deadletter.>'],
        storage: StorageType.File,
        retention: RetentionPolicy.Limits,
        max_age: 30 * 24 * 60 * 60 * 1_000_000_000,
      });
    }
    try {
      await jsm.consumers.info('VIGILIO', 'platform-worker');
    } catch {
      await jsm.consumers.add('VIGILIO', {
        durable_name: 'platform-worker',
        ack_policy: AckPolicy.Explicit,
        ack_wait: 120 * 1_000_000_000,
        max_deliver: 10,
        filter_subject: 'events.>',
      });
    }
  } finally {
    await nc.drain();
  }
}
