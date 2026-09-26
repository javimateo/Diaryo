import { SITE } from './site';

export interface Download {
  version: string;
  sizeMB: number;
  file: string;
  /** The installer itself, or the releases page when it isn't known. */
  url: string;
}

interface GitHubRelease {
  tag_name: string;
  assets: { name: string; size: number; browser_download_url: string }[];
}

let latest: Promise<Download> | null = null;

/**
 * The latest published version's installer, asked to GitHub when the site is built (so
 * the site is rebuilt after each release). Without an answer, the one in `SITE`.
 */
export function latestDownload(): Promise<Download> {
  latest ??= fetchLatest();
  return latest;
}

async function fetchLatest(): Promise<Download> {
  const fallback = { ...SITE.download, url: SITE.releases };
  try {
    const api = SITE.repo.replace('https://github.com/', 'https://api.github.com/repos/');
    const response = await fetch(`${api}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) return fallback;
    const release = (await response.json()) as GitHubRelease;
    const installer = release.assets.find((asset) => asset.name.endsWith('-setup.exe'));
    if (!installer) return fallback;
    return {
      version: release.tag_name.replace(/^v/, ''),
      sizeMB: installer.size / 1024 / 1024,
      file: installer.name,
      url: installer.browser_download_url,
    };
  } catch {
    return fallback;
  }
}
