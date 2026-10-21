import { ClientResponseError } from 'pocketbase';
import { describe, expect, it } from 'vitest';
import { accountError } from './account';

const failure = (status: number, data: object = {}, url = 'https://cloud/api/x') =>
  new ClientResponseError({ status, url, response: { status, message: '', data } });

describe('accountError', () => {
  it('tells what went wrong, as the server answers', () => {
    expect(accountError(new ClientResponseError(new TypeError('Failed to fetch')))).toBe('offline');
    expect(accountError(new ClientResponseError(new Error('Missing provider')))).toBe('unknown');
    expect(accountError(failure(429))).toBe('tooMany');
    expect(
      accountError(failure(400, {}, 'https://cloud/api/collections/users/auth-with-password')),
    ).toBe('credentials');
    expect(accountError(failure(400, { email: { code: 'validation_not_unique' } }))).toBe(
      'emailTaken',
    );
    expect(accountError(failure(400, { email: { code: 'validation_is_email' } }))).toBe(
      'invalidEmail',
    );
    expect(accountError(failure(400, { token: { code: 'validation_invalid_token' } }))).toBe(
      'invalidLink',
    );
    expect(accountError(new ClientResponseError({ isAbort: true }))).toBe('cancelled');
    expect(accountError(new Error('?'))).toBe('unknown');
  });
});
