/**
 * Derives a url-safe slug from a human name.
 *
 * A domain rule rather than a controller helper: the slug is half of
 * `@@unique([workspaceId, slug])`, so what counts as "the same name" is decided
 * here. Two callers deriving it slightly differently would let `My Flow` and
 * `my  flow` both insert.
 *
 * Deliberately ASCII-only. Transliterating accents needs a table nobody here
 * maintains, and a slug is an identifier, not a display string — the name keeps
 * the original text.
 */
export function slugify(value: string, maxLength = 150): string {
  const slug = value
    .normalize('NFKD')
    // Strip combining marks, so `é` becomes `e` rather than disappearing.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    // Slicing can leave a trailing dash behind; trim again rather than emit one.
    .replace(/-+$/, '');

  // Everything was stripped — a name of only emoji or CJK. Falling back keeps
  // the row insertable; the unique index still arbitrates, so the second such
  // workflow gets a conflict rather than a silent overwrite.
  return slug || 'workflow';
}
