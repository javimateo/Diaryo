import { describe, expect, it } from 'vitest';
import { readAccountLink } from './links';

describe('readAccountLink', () => {
  it('reads the links of the emails', () => {
    expect(readAccountLink('?verify=abc.def')).toEqual({ kind: 'verify', token: 'abc.def' });
    expect(readAccountLink('?reset=xyz')).toEqual({ kind: 'reset', token: 'xyz' });
  });

  it('ignores everything else', () => {
    expect(readAccountLink('')).toBeNull();
    expect(readAccountLink('?capa=mesa')).toBeNull();
    expect(readAccountLink('?verify=')).toBeNull();
  });
});
