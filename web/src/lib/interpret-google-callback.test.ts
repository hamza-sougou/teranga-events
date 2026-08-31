import { describe, expect, it } from 'vitest';
import { interpretGoogleCallback } from './interpret-google-callback';

describe('interpretGoogleCallback', () => {
  it('parses a login status with its token', () => {
    expect(interpretGoogleCallback('status=login&token=abc123')).toEqual({
      status: 'login',
      token: 'abc123',
    });
  });

  it('parses a login_linked status with its token', () => {
    expect(interpretGoogleCallback('status=login_linked&token=abc123')).toEqual({
      status: 'login_linked',
      token: 'abc123',
    });
  });

  it('parses a signup_pending status with its pendingToken', () => {
    expect(interpretGoogleCallback('status=signup_pending&pendingToken=xyz789')).toEqual({
      status: 'signup_pending',
      pendingToken: 'xyz789',
    });
  });

  it('treats an empty fragment as invalid', () => {
    expect(interpretGoogleCallback('')).toEqual({ status: 'invalid' });
  });

  it('treats a missing status as invalid', () => {
    expect(interpretGoogleCallback('token=abc123')).toEqual({ status: 'invalid' });
  });

  it('treats an unknown status as invalid', () => {
    expect(interpretGoogleCallback('status=something_else&token=abc123')).toEqual({ status: 'invalid' });
  });

  it('treats login without a token as invalid', () => {
    expect(interpretGoogleCallback('status=login')).toEqual({ status: 'invalid' });
  });

  it('treats login_linked without a token as invalid', () => {
    expect(interpretGoogleCallback('status=login_linked')).toEqual({ status: 'invalid' });
  });

  it('treats signup_pending without a pendingToken as invalid', () => {
    expect(interpretGoogleCallback('status=signup_pending')).toEqual({ status: 'invalid' });
  });
});
