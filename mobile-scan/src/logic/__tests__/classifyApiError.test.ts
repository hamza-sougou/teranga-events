import { classifyApiError, HttpError } from '../classifyApiError';

describe('classifyApiError', () => {
  it('classifies a TypeError (fetch network failure) as NETWORK', () => {
    const result = classifyApiError(new TypeError('Network request failed'));
    expect(result).toEqual({ kind: 'NETWORK' });
  });

  it('classifies an HttpError with a string message as API', () => {
    const error = new HttpError(401, { statusCode: 401, message: 'Invalid credentials' });
    const result = classifyApiError(error);
    expect(result).toEqual({ kind: 'API', statusCode: 401, message: 'Invalid credentials' });
  });

  it('joins an HttpError with a string[] message (class-validator shape)', () => {
    const error = new HttpError(400, {
      statusCode: 400,
      message: ['qrToken should not be empty'],
    });
    const result = classifyApiError(error);
    expect(result).toEqual({
      kind: 'API',
      statusCode: 400,
      message: 'qrToken should not be empty',
    });
  });

  it('classifies an unrelated Error as UNKNOWN, preserving its message', () => {
    const result = classifyApiError(new Error('something else broke'));
    expect(result).toEqual({ kind: 'UNKNOWN', message: 'something else broke' });
  });

  it('classifies a thrown non-Error value as UNKNOWN without throwing', () => {
    const result = classifyApiError('a plain string throw');
    expect(result).toEqual({ kind: 'UNKNOWN', message: 'Unknown error' });
  });
});
