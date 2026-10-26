import { describe, expect, it } from 'vitest';
import { readAccountLink } from './links';

const at = (search: string, hash = '') => ({ search, hash });

describe('readAccountLink', () => {
  it('reads the links of the emails, after # (they never reach a server)', () => {
    expect(readAccountLink(at('', '#verify=abc.def'))).toEqual({
      kind: 'verify',
      token: 'abc.def',
    });
    expect(readAccountLink(at('', '#reset=xyz'))).toEqual({ kind: 'reset', token: 'xyz' });
  });

  it('still reads the ones sent before, after ?', () => {
    expect(readAccountLink(at('?verify=abc.def'))).toEqual({ kind: 'verify', token: 'abc.def' });
    expect(readAccountLink(at('?reset=xyz'))).toEqual({ kind: 'reset', token: 'xyz' });
  });

  it('ignores everything else', () => {
    expect(readAccountLink(at(''))).toBeNull();
    expect(readAccountLink(at('?capa=mesa', '#algo'))).toBeNull();
    expect(readAccountLink(at('?verify=', '#reset='))).toBeNull();
  });
});
