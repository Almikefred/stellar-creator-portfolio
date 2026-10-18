/** Server-side validation shared by the upload route and its tests. */

const DEFAULT_ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
];

const DEFAULT_MAX_UPLOAD_MB = 100;

/** MIME types accepted for upload; override with ALLOWED_FILE_TYPES (comma-separated). */
export function allowedTypes(): string[] {
  const configured = process.env.ALLOWED_FILE_TYPES?.split(',')
    .map((type) => type.trim())
    .filter(Boolean);
  return configured?.length ? configured : DEFAULT_ALLOWED_TYPES;
}

/** Upload size limit in bytes; override with MAX_UPLOAD_MB. */
export function maxUploadBytes(): number {
  const configured = Number(process.env.MAX_UPLOAD_MB);
  const megabytes = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_UPLOAD_MB;
  return megabytes * 1024 * 1024;
}

/**
 * Reduces a filename to lowercase letters, digits, dots and single hyphens
 * so it is safe to embed in an object key.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/-+\./g, '.')
    .replace(/^-+|-+$/g, '');
}

/** Returns a human-readable rejection reason, or null when the file is acceptable. */
export async function validateFile(file: Pick<File, 'name' | 'size' | 'type'>): Promise<string | null> {
  const limit = maxUploadBytes();
  if (file.size > limit) {
    return `File ${file.name} exceeds ${Math.round(limit / (1024 * 1024))}MB limit`;
  }
  if (!allowedTypes().includes(file.type)) {
    return `File type ${file.type || 'unknown'} not allowed`;
  }
  return null;
}
