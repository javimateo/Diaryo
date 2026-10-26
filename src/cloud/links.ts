/**
 * A link from one of the account's emails, in the address: after `#` (`#verify=…`,
 * `#reset=…`), which the browser never sends to a server (nor its logs), or, in the emails
 * sent before, after `?`.
 */
export interface AccountLink {
  kind: 'verify' | 'reset';
  token: string;
}

export function readAccountLink({ search, hash }: { search: string; hash: string }) {
  for (const part of [hash.slice(1), search]) {
    const params = new URLSearchParams(part);
    for (const kind of ['verify', 'reset'] as const) {
      const token = params.get(kind);
      if (token) return { kind, token } as AccountLink;
    }
  }
  return null;
}
