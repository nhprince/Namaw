const WINDOWS_RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]);

export interface TemplateVariables {
  title?: string;
  resolution?: string;
  ext?: string;
  channel?: string;
  date?: string;
}

/**
 * Sanitizes a single filename or directory name component:
 * - Strips directory traversal (../, ./)
 * - Replaces illegal chars (<>:"/\|?* and control chars) with safe alternatives or underscores
 * - Trims leading/trailing whitespace and trailing dots (Windows issue)
 * - Guards against Windows reserved filenames (CON, PRN, AUX, etc.)
 * - Truncates to safe filesystem length (max 200 chars to leave headroom for path limits)
 */
export function sanitizeFilename(raw: string, fallback = 'video'): string {
  if (!raw || typeof raw !== 'string') {
    return fallback;
  }

  // Normalize Unicode (NFC)
  let name = raw.normalize('NFC');

  // Strip path traversal indicators
  name = name.replace(/\.\.+[/\\$]/g, '');

  // Replace invalid characters: < > : " / \ | ? * and ASCII control characters (0-31)
  name = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');

  // Trim spaces and trailing periods (Windows cannot handle filenames ending in dot or space)
  name = name.trim().replace(/[. ]+$/, '');

  // Extract base name without extension for reserved name check
  const lastDot = name.lastIndexOf('.');
  const base = lastDot !== -1 ? name.slice(0, lastDot) : name;
  const ext = lastDot !== -1 ? name.slice(lastDot) : '';

  if (WINDOWS_RESERVED_NAMES.has(base.toUpperCase())) {
    name = `${base}_safe${ext}`;
  }

  // If empty after sanitization, use fallback
  if (!name || name === '.' || name === '..') {
    return fallback;
  }

  // Truncate length (max 200 characters for base name to avoid MAX_PATH issues)
  const MAX_BASE_LEN = 200;
  if (base.length > MAX_BASE_LEN) {
    name = base.slice(0, MAX_BASE_LEN).trim() + ext;
  }

  return name;
}

/**
 * Renders a filename from a user-defined naming template.
 * Supported variables: {title}, {resolution}, {channel}, {date}, {ext}
 */
export function renderFilenameTemplate(
  template: string,
  variables: TemplateVariables
): string {
  const safeTitle = sanitizeFilename(variables.title || 'video', 'video');
  const safeRes = variables.resolution
    ? sanitizeFilename(variables.resolution, '')
    : '';
  const safeChannel = variables.channel
    ? sanitizeFilename(variables.channel, '')
    : '';
  const safeDate =
    variables.date || new Date().toISOString().slice(0, 10);
  let ext = (variables.ext || 'mp4').toLowerCase().replace(/^\./, '');
  ext = sanitizeFilename(ext, 'mp4');

  let rendered = template
    .replace(/\{title\}/gi, safeTitle)
    .replace(/\{resolution\}/gi, safeRes)
    .replace(/\{channel\}/gi, safeChannel)
    .replace(/\{date\}/gi, safeDate)
    .replace(/\{ext\}/gi, ext);

  // Clean up any double spaces, empty brackets, or dangling hyphens from empty variables
  rendered = rendered
    .replace(/\[\s*\]/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+-\s*(\.[a-z0-9]+)$/i, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip trailing spaces right before the extension
  rendered = rendered.replace(/\s+(\.[a-z0-9]+)$/i, '$1');

  // Ensure extension is present
  if (!rendered.toLowerCase().endsWith(`.${ext}`)) {
    rendered = `${rendered.trim()}.${ext}`;
  }

  return sanitizeFilename(rendered, `video.${ext}`);
}
