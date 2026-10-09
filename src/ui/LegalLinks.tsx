import type { MouseEvent } from 'react';
import { call, isDesktop } from '../desktop/tauri';
import { useT } from './useT';

/** A page of the website: a new tab on the web, the browser on the desktop. */
export function WebsiteLink({ href, children }: { href: string; children: string }) {
  const open = (event: MouseEvent) => {
    if (!isDesktop()) return;
    event.preventDefault();
    void call('open_website', { url: href });
  };
  return (
    <a href={href} target="_blank" rel="noopener" onClick={open}>
      {children}
    </a>
  );
}

/** "By continuing you accept the terms and the privacy policy", with the links. */
export function LegalNote() {
  const l = useT().account.legal;
  const [before, rest = ''] = l.note.split('{terms}');
  const [middle, after] = rest.split('{privacy}');
  return (
    <p className="account-small account-legal">
      {before}
      <WebsiteLink href={l.termsUrl}>{l.terms}</WebsiteLink>
      {middle}
      <WebsiteLink href={l.privacyUrl}>{l.privacy}</WebsiteLink>
      {after}
    </p>
  );
}

/** The privacy policy and the terms, in the settings. */
export function LegalLinks() {
  const l = useT().account.legal;
  return (
    <div className="account-legal-links">
      <WebsiteLink href={l.privacyUrl}>{l.privacyPage}</WebsiteLink>
      <WebsiteLink href={l.termsUrl}>{l.termsPage}</WebsiteLink>
    </div>
  );
}
