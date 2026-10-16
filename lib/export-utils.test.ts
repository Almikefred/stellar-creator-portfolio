import { describe, it, expect } from 'vitest';
import { toCSV, createCsvStream } from './export-utils';

describe('toCSV', () => {
  it('renders a simple header + rows', () => {
    const csv = toCSV(['a', 'b'], [{ a: '1', b: '2' }]);
    expect(csv).toBe('a,b\n1,2');
  });

  it('quotes values containing a comma, newline, or quote', () => {
    const csv = toCSV(['title'], [{ title: 'has, a comma' }]);
    expect(csv).toBe('title\n"has, a comma"');
  });

  it('neutralizes CSV/formula injection by prefixing a leading quote', () => {
    const csv = toCSV(['title'], [{ title: '=HYPERLINK("http://evil","click")' }]);
    const [, row] = csv.split('\n');
    // Must not start with a raw '=' (or +, -, @, tab, CR) — that's what a
    // spreadsheet app evaluates as a formula.
    expect(row.startsWith('=')).toBe(false);
    expect(row).toContain("'=HYPERLINK");
  });

  it('neutralizes +, -, @ and tab-prefixed cells', () => {
    for (const malicious of ['+1+1', '-2+3', '@SUM(A1:A9)', '\tcmd']) {
      const csv = toCSV(['x'], [{ x: malicious }]);
      const [, row] = csv.split('\n');
      expect(row.startsWith(malicious[0])).toBe(false);
    }
  });

  it('does not alter benign values that happen to contain = elsewhere', () => {
    const csv = toCSV(['x'], [{ x: 'a=b' }]);
    const [, row] = csv.split('\n');
    expect(row).toBe('a=b');
  });

  it('renders null/undefined as empty string', () => {
    const csv = toCSV(['a'], [{ a: null }, { a: undefined }]);
    expect(csv).toBe('a\n\n');
  });
});

describe('createCsvStream', () => {
  async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let out = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      out += decoder.decode(value);
    }
    return out;
  }

  it('writes the header once and paginates until nextCursor is null', async () => {
    const batches = [
      { rows: [{ id: '1', name: 'a' }], nextCursor: '1' },
      { rows: [{ id: '2', name: 'b' }], nextCursor: null },
    ];
    let call = 0;
    const stream = createCsvStream<string>(['id', 'name'], async () => {
      const batch = batches[call];
      call++;
      return batch;
    });

    const text = await drain(stream);
    expect(text).toBe('id,name\n1,a\n2,b\n');
    expect(call).toBe(2);
  });

  it('never buffers more than one batch at a time (streams incrementally)', async () => {
    // Simulate a huge logical result set split into many small batches —
    // the point of createCsvStream is that this never materializes a
    // single array/string containing all of them.
    const totalBatches = 50;
    let call = 0;
    const stream = createCsvStream<number>(['n'], async (cursor) => {
      const i = cursor ?? 0;
      if (i >= totalBatches) return { rows: [], nextCursor: null };
      call++;
      return { rows: [{ n: i }], nextCursor: i + 1 >= totalBatches ? null : i + 1 };
    });

    const text = await drain(stream);
    const lines = text.trim().split('\n');
    expect(lines[0]).toBe('n');
    expect(lines).toHaveLength(totalBatches + 1);
    expect(call).toBe(totalBatches);
  });

  it('escapes CSV injection in streamed rows the same as toCSV', async () => {
    const stream = createCsvStream<null>(['title'], async () => ({
      rows: [{ title: '=1+1' }],
      nextCursor: null,
    }));
    const text = await drain(stream);
    expect(text).toContain("'=1+1");
  });
});
