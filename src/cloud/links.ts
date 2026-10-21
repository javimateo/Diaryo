/** A link from one of the account's emails, in the address (`?verify=…`, `?reset=…`). */
export interface AccountLink {
  kind: 'verify' | 'reset';
  token: string;
}

export function readAccountLink(search: string): AccountLink | null {
  const params = new URLSearchParams(search);
  for (const kind of ['verify', 'reset'] as const) {
    const token = params.get(kind);
    if (token) return { kind, token };
  }
  return null;
}
