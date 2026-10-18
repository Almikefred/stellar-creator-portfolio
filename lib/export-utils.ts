/**
 * Utility functions for streaming CSV/JSON exports.
 */

/**
 * Escape a single CSV cell: neutralizes formula/CSV injection, then quotes
 * if the value needs it.
 *
 * Opening a report in Excel/Sheets/LibreOffice evaluates a cell that starts
 * with `=`, `+`, `-`, `@`, tab, or CR as a formula. A bounty title, dispute
 * reason, or user-supplied name containing e.g. `=HYPERLINK(...)` or
 * `=cmd|'/c calc'!A1` becomes code execution for whoever opens the export
 * in a spreadsheet app — a textbook CSV injection. Prefixing with a single
 * quote forces spreadsheet apps to treat the cell as literal text; it's
 * the standard mitigation (OWASP CSV Injection cheat sheet) and is itself
 * then covered by the normal quote-escaping below if it also contains a
 * comma/newline/quote.
 */
function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let str = String(value);

  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert array of objects to CSV format, with CSV-injection escaping.
 *
 * Only suitable for row counts that comfortably fit in memory — for an
 * unbounded/admin-controlled date range, use `createCsvStream` instead so
 * the whole result set is never held in memory at once.
 */
export function toCSV(headers: string[], rows: Record<string, unknown>[]): string {
  const csvHeaders = headers.map(escapeCsvCell).join(',');
  const csvRows = rows
    .map((row) => headers.map((header) => escapeCsvCell(row[header])).join(','))
    .join('\n');

  return `${csvHeaders}\n${csvRows}`;
}

/**
 * Build a `ReadableStream` that emits a CSV a batch at a time, so a large
 * date range streams straight to the response instead of being buffered
 * as one giant array/string in memory first.
 *
 * `fetchNextBatch` receives the previous batch's cursor (`null` on the
 * first call) and returns the next batch of already-report-shaped rows
 * plus the cursor to pass next; return `nextCursor: null` to signal
 * there's no more data. Each batch is encoded and enqueued immediately,
 * so memory use stays bounded by one batch's size regardless of how many
 * rows match the query overall.
 */
export function createCsvStream<TCursor>(
  headers: string[],
  fetchNextBatch: (
    cursor: TCursor | null,
  ) => Promise<{ rows: Record<string, unknown>[]; nextCursor: TCursor | null }>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let cursor: TCursor | null = null;
  let wroteHeader = false;
  let done = false;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (done) {
        controller.close();
        return;
      }

      if (!wroteHeader) {
        controller.enqueue(encoder.encode(`${headers.map(escapeCsvCell).join(',')}\n`));
        wroteHeader = true;
      }

      const { rows, nextCursor } = await fetchNextBatch(cursor);

      if (rows.length > 0) {
        const chunk = `${rows
          .map((row) => headers.map((header) => escapeCsvCell(row[header])).join(','))
          .join('\n')}\n`;
        controller.enqueue(encoder.encode(chunk));
      }

      cursor = nextCursor;
      if (nextCursor === null) {
        done = true;
        controller.close();
      }
    },
  });
}

/**
 * Format bytes as human-readable size.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}
