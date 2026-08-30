import { describe, expect, it } from 'vitest';
import { interpretOrderStatus } from './interpret-order-status';

describe('interpretOrderStatus', () => {
  it('maps PAID to paid', () => {
    expect(interpretOrderStatus('PAID')).toBe('paid');
  });

  it('maps PENDING to pending', () => {
    expect(interpretOrderStatus('PENDING')).toBe('pending');
  });

  it('maps EXPIRED to expired, distinct from a failed payment', () => {
    expect(interpretOrderStatus('EXPIRED')).toBe('expired');
  });

  it('maps CANCELLED to failed', () => {
    expect(interpretOrderStatus('CANCELLED')).toBe('failed');
  });

  it('maps REFUNDED to failed', () => {
    expect(interpretOrderStatus('REFUNDED')).toBe('failed');
  });
});
