import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../fence-fable.html', import.meta.url), 'utf8');

// buildPdf() and pdfBytes() touch no DOM, so the file they write can be checked here.
function pdfWriter() {
  const start = html.indexOf('const PDF_DPI =');
  const end = html.indexOf('function renderPdfPage(', start);
  assert.ok(start >= 0 && end > start);
  const context = { Math, Uint8Array, String, Number };
  vm.createContext(context);
  vm.runInContext(html.slice(start, end), context);
  return context;
}

test('the exported file is a structurally valid PDF', () => {
  const { buildPdf } = pdfWriter();
  const jpeg = a => Uint8Array.from(a);
  const bytes = buildPdf([{ jpeg: jpeg([0xff,0xd8,1,2,3,0xff,0xd9]), w: 100, h: 70 },
                          { jpeg: jpeg([0xff,0xd8,9,9,0xff,0xd9]),   w: 100, h: 70 }], 297, 210);
  const text = Buffer.from(bytes).toString('latin1');

  assert.ok(text.startsWith('%PDF-1.4\n'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  assert.equal((text.match(/\/Type \/Page[^s]/g) || []).length, 2);
  assert.match(text, /\/Type \/Pages \/Kids \[3 0 R 6 0 R\] \/Count 2/);
  // A4 landscape in points, which is what a printer will honour
  assert.match(text, /\/MediaBox \[0 0 841\.89 595\.28\]/);
  // the JPEG goes in as its own bytes — no re-encoding, no filter to get wrong
  assert.equal((text.match(/\/Filter \/DCTDecode/g) || []).length, 2);
  assert.ok(text.includes('\xff\xd8\x01\x02\x03\xff\xd9'), 'first image embedded verbatim');

  /* Every xref offset must land exactly on its own "N 0 obj". This is the one part of a
     hand-written PDF that silently rots — a stream length or an added object shifts every
     offset after it, and readers either repair it quietly or refuse the file. */
  const xrefAt = +text.slice(text.lastIndexOf('startxref') + 9).trim().split('\n')[0];
  assert.equal(text.slice(xrefAt, xrefAt + 4), 'xref');
  const table = text.slice(xrefAt).split('\n');
  const count = +table[1].split(' ')[1];
  assert.equal(count, 9);   // the free head, then catalog + pages + 3 objects per page
  for (let n = 1; n < count; n++){
    const offset = +table[2 + n].slice(0, 10);   // [0] xref, [1] '0 N', [2] the free entry
    assert.equal(text.slice(offset, offset + `${n} 0 obj`.length), `${n} 0 obj`,
                 `xref entry ${n} should point at object ${n}`);
  }
  assert.match(text, new RegExp(`trailer\\n<< /Size ${count} /Root 1 0 R >>`));
});

test('a PDF page is the sheet page, painted at print resolution', () => {
  // same painter, same paper: only the target canvas and the scale change
  assert.match(html, /function renderPdfPage\(pg, u, wPx, hPx\)\{/);
  assert.match(html, /view = \{ x:0, y:pg\.top, s:wPx\/SHEET\.w \};/);
  assert.match(html, /try \{ paintSheetPage\(pg, u, annotScale\(\)\); \}/);
  // and the live canvas is put back even if a page throws
  assert.match(html, /finally \{ ctx = screen\.ctx; cw = screen\.cw; ch = screen\.ch; view = screen\.view; \}/);
  assert.doesNotMatch(html, /function paintPdfElevation|pdfDimension/);   // no second renderer
  // ctx has to be repointable for that to work
  assert.match(html, /let ctx = cv\.getContext\('2d'\);/);
  // the button is out only while the sheet is up
  assert.match(html, /#bPdf\{display:none\}/);
  assert.match(html, /body\.sheetview #bPdf\{display:inline-flex\}/);
  assert.match(html, /\$\('bPdf'\)\.addEventListener\('click', exportSheetPdf\);/);
});
