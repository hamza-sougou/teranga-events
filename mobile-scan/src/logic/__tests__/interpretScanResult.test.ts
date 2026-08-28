import { interpretScanFailure, interpretScanSuccess } from '../interpretScanResult';
import type { ScanTicketResponse } from '../../types/api';

function response(result: ScanTicketResponse['result']): ScanTicketResponse {
  return {
    result,
    ticket: { id: 't1', holderName: 'Awa Diop', holderEmail: 'awa@example.com', ticketTypeName: 'VIP' },
  };
}

describe('interpretScanSuccess', () => {
  it('maps SUCCESS to a SUCCESS outcome carrying holder + ticket type', () => {
    expect(interpretScanSuccess(response('SUCCESS'))).toEqual({
      kind: 'SUCCESS',
      ticketTypeName: 'VIP',
      holderName: 'Awa Diop',
    });
  });

  it('maps ALREADY_USED to an ALREADY_USED outcome', () => {
    expect(interpretScanSuccess(response('ALREADY_USED'))).toEqual({
      kind: 'ALREADY_USED',
      ticketTypeName: 'VIP',
    });
  });

  it('maps INVALID to an INVALID outcome', () => {
    expect(interpretScanSuccess(response('INVALID'))).toEqual({ kind: 'INVALID' });
  });

  it('maps EXPIRED_EVENT to an EXPIRED_EVENT outcome', () => {
    expect(interpretScanSuccess(response('EXPIRED_EVENT'))).toEqual({ kind: 'EXPIRED_EVENT' });
  });

  it('falls back to SCAN_ERROR for an unrecognized result code rather than guessing', () => {
    const malformed = response('SUCCESS');
    // @ts-expect-error deliberately malformed to exercise the defensive branch
    malformed.result = 'SOMETHING_NEW';
    const outcome = interpretScanSuccess(malformed);
    expect(outcome.kind).toBe('SCAN_ERROR');
  });
});

describe('interpretScanFailure', () => {
  it('maps a NETWORK classification to NO_CONNECTION, never a ticket verdict', () => {
    expect(interpretScanFailure({ kind: 'NETWORK' })).toEqual({ kind: 'NO_CONNECTION' });
  });

  it('maps an API classification to SCAN_ERROR with the message preserved', () => {
    expect(interpretScanFailure({ kind: 'API', statusCode: 500, message: 'boom' })).toEqual({
      kind: 'SCAN_ERROR',
      message: 'boom',
    });
  });

  it('maps an UNKNOWN classification to SCAN_ERROR with the message preserved', () => {
    expect(interpretScanFailure({ kind: 'UNKNOWN', message: 'mystery' })).toEqual({
      kind: 'SCAN_ERROR',
      message: 'mystery',
    });
  });
});
