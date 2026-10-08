import { convertFileSrc } from "@tauri-apps/api/core";
import { htmlToPlainText } from "./description";

/**
 * Turn a stored `cover_art` value into something an <img> can load.
 * Covers are stored as local file paths (in the app's covers dir) or remote URLs.
 */
export function coverSrc(cover: string | null | undefined): string | null {
  if (!cover) return null;
  if (/^(https?|data|blob|asset):/i.test(cover)) return cover;
  return convertFileSrc(cover);
}

/**
 * Fetches cover art and description from Open Library API.
 * Falls back to Google Books API if Open Library has no results.
 */

interface CoverResult {
  coverUrl: string | null;
  description: string | null;
  /** False when no lookup service could be reached (e.g. offline) */
  reachable: boolean;
}

const EMPTY: CoverResult = { coverUrl: null, description: null, reachable: false };
const NOT_FOUND: CoverResult = { coverUrl: null, description: null, reachable: true };

export async function fetchBookCover(title: string, author?: string): Promise<CoverResult> {
  // Try Open Library first
  const olResult = await fetchFromOpenLibrary(title, author);

  // If we got both cover and description, we're done
  if (olResult.coverUrl && olResult.description) return olResult;

  // Try Google Books for anything missing
  const gbResult = await fetchFromGoogleBooks(title, author);

  return {
    coverUrl: olResult.coverUrl || gbResult.coverUrl,
    description: olResult.description || gbResult.description,
    reachable: olResult.reachable || gbResult.reachable,
  };
}

async function fetchFromOpenLibrary(title: string, author?: string): Promise<CoverResult> {
  try {
    const params = new URLSearchParams({
      title: title,
      fields: "key,title,author_name,cover_i",
      limit: "5",
    });
    if (author && author !== "Unknown") {
      params.set("author", author);
    }

    const res = await fetch(`https://openlibrary.org/search.json?${params}`);
    if (!res.ok) return EMPTY;

    const data = await res.json();
    if (!data.docs || data.docs.length === 0) return NOT_FOUND;

    const doc = data.docs[0];
    let coverUrl: string | null = null;
    let description: string | null = null;

    if (doc.cover_i) {
      coverUrl = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
    }

    // Fetch description from Works API
    if (doc.key) {
      try {
        const workRes = await fetch(`https://openlibrary.org${doc.key}.json`);
        if (workRes.ok) {
          const workData = await workRes.json();
          if (typeof workData.description === "string") {
            description = workData.description;
          } else if (workData.description?.value) {
            description = workData.description.value;
          }
        }
      } catch {
        // Description fetch failed, that's fine
      }
    }

    return { coverUrl, description, reachable: true };
  } catch {
    return EMPTY;
  }
}

async function fetchFromGoogleBooks(title: string, author?: string): Promise<CoverResult> {
  try {
    let query = `intitle:${title}`;
    if (author && author !== "Unknown") {
      query += `+inauthor:${author}`;
    }

    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5`
    );
    if (!res.ok) return EMPTY;

    const data = await res.json();
    if (!data.items || data.items.length === 0) return NOT_FOUND;

    const vol = data.items[0].volumeInfo;
    let coverUrl: string | null = null;
    let description: string | null = null;

    if (vol.imageLinks) {
      // Prefer larger images
      coverUrl =
        vol.imageLinks.extraLarge ||
        vol.imageLinks.large ||
        vol.imageLinks.medium ||
        vol.imageLinks.thumbnail ||
        vol.imageLinks.smallThumbnail ||
        null;
      // Google returns http, upgrade to https
      if (coverUrl) {
        coverUrl = coverUrl.replace("http://", "https://");
      }
    }

    if (vol.description) {
      // Google's descriptions are HTML; keep their paragraph breaks
      description = htmlToPlainText(vol.description);
    }

    return { coverUrl, description, reachable: true };
  } catch {
    return EMPTY;
  }
}

export interface CoverCandidate {
  /** Full-size image to save */
  url: string;
  /** Smaller image for the picker */
  thumb: string;
  source: "Open Library" | "Google Books";
  /** Which edition it came from, e.g. "The Hobbit (1937)" */
  label: string;
}

export interface CoverSearch {
  candidates: CoverCandidate[];
  description: string | null;
  /** False when neither service could be reached (e.g. offline) */
  reachable: boolean;
}

const MAX_PER_SOURCE = 6;

/**
 * Several possible covers from Open Library and Google Books, so the user can
 * pick the right edition instead of taking whatever matched first.
 */
export async function searchCovers(title: string, author?: string): Promise<CoverSearch> {
  const [ol, gb] = await Promise.all([searchOpenLibrary(title, author), searchGoogleBooks(title, author)]);
  const seen = new Set<string>();
  const candidates = [...ol.candidates, ...gb.candidates].filter((c) => !seen.has(c.url) && seen.add(c.url));
  return {
    candidates,
    description: ol.description || gb.description,
    reachable: ol.reachable || gb.reachable,
  };
}

const withYear = (name: string, year: unknown) => (year ? `${name} (${String(year).slice(0, 4)})` : name);

async function searchOpenLibrary(title: string, author?: string): Promise<CoverSearch> {
  try {
    const params = new URLSearchParams({ title, fields: "key,title,cover_i,first_publish_year", limit: "12" });
    if (author && author !== "Unknown") params.set("author", author);
    const res = await fetch(`https://openlibrary.org/search.json?${params}`);
    if (!res.ok) return { candidates: [], description: null, reachable: false };
    const docs: { key?: string; title?: string; cover_i?: number; first_publish_year?: number }[] = (await res.json()).docs ?? [];

    const candidates: CoverCandidate[] = docs
      .filter((d) => d.cover_i)
      .slice(0, MAX_PER_SOURCE)
      .map((d) => ({
        url: `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`,
        thumb: `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`,
        source: "Open Library",
        label: withYear(d.title ?? title, d.first_publish_year),
      }));

    // The description lives on the work, not in search results
    let description: string | null = null;
    const key = docs.find((d) => d.key)?.key;
    if (key) {
      try {
        const work = await (await fetch(`https://openlibrary.org${key}.json`)).json();
        description = typeof work.description === "string" ? work.description : work.description?.value ?? null;
      } catch {
        // No description then
      }
    }
    return { candidates, description, reachable: true };
  } catch {
    return { candidates: [], description: null, reachable: false };
  }
}

async function searchGoogleBooks(title: string, author?: string): Promise<CoverSearch> {
  try {
    let query = `intitle:${title}`;
    if (author && author !== "Unknown") query += `+inauthor:${author}`;
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=12`);
    if (!res.ok) return { candidates: [], description: null, reachable: false };
    const items: { volumeInfo: any }[] = (await res.json()).items ?? [];

    // Google's image links are http and may have a page-curl effect baked in
    const clean = (u: string) => u.replace(/^http:/, "https:").replace(/&edge=curl/g, "");
    const candidates: CoverCandidate[] = items
      .map((i) => i.volumeInfo)
      .filter((v) => v?.imageLinks?.thumbnail)
      .slice(0, MAX_PER_SOURCE)
      .map((v) => {
        const links = v.imageLinks;
        const best = links.extraLarge || links.large || links.medium || links.thumbnail;
        return {
          url: clean(best),
          thumb: clean(links.thumbnail),
          source: "Google Books",
          label: withYear(v.title ?? title, v.publishedDate),
        };
      });

    const withDescription = items.find((i) => i.volumeInfo?.description);
    const description = withDescription ? htmlToPlainText(withDescription.volumeInfo.description) : null;
    return { candidates, description, reachable: true };
  } catch {
    return { candidates: [], description: null, reachable: false };
  }
}
