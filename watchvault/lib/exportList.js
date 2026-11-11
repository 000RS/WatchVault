'use client';

// Export all or part of your vault as Excel, CSV, Word or PDF, made in the browser (no server, no cost).

import { CATEGORY_LABEL, audioLabel, isScreen, kindInfo, languageName, progressLabel, statusLabel } from './categories';

export const FORMATS = [
  { id: 'xlsx', label: 'Excel', ext: 'xlsx', hint: 'Opens in Excel, Google Sheets, Numbers' },
  { id: 'csv', label: 'CSV', ext: 'csv', hint: 'Plain table for any app' },
  { id: 'docx', label: 'Word', ext: 'docx', hint: 'A tidy table you can edit' },
  { id: 'pdf', label: 'PDF', ext: 'pdf', hint: 'Ready to print or share' },
];

/** What kind of thing an entry is, for the type filter: films, series, anime, short dramas, everything else. */
export function typeOf(e) {
  if (e.category === 'anime') return 'anime';
  if (e.category === 'shortdrama') return 'shortdrama';
  if (e.media_type === 'movie') return 'movie';
  if (e.media_type === 'tv') return 'series';
  return 'other';
}
export const TYPES = [
  { id: 'movie', label: 'Movies' },
  { id: 'series', label: 'Series & dramas' },
  { id: 'anime', label: 'Anime' },
  { id: 'shortdrama', label: 'Short dramas' },
  { id: 'other', label: 'Books, games, places & more' },
];

export const EMPTY_EXPORT = { types: [], shelves: [], statuses: [], language: '', country: '', fav: false, cinema: false, from: '', to: '', minRating: '' };

export function filterForExport(entries, f) {
  return entries.filter(
    (e) =>
      (!f.types.length || f.types.includes(typeOf(e))) &&
      (!f.shelves.length || f.shelves.includes(e.category)) &&
      (!f.statuses.length || f.statuses.includes(e.status)) &&
      (!f.language || e.original_language === f.language) &&
      (!f.country || e.origin_country === f.country) &&
      (!f.fav || e.favourite) &&
      (!f.cinema || e.meta?.cinema) &&
      (!f.from || (e.year && e.year >= Number(f.from))) &&
      (!f.to || (e.year && e.year <= Number(f.to))) &&
      (!f.minRating || (e.rating ?? 0) >= Number(f.minRating))
  );
}

/** "English movies", "Anime, completed", "Everything": a name for the file and its heading. */
export function describe(f, extra) {
  if (extra) return extra;
  const typeNames = { movie: 'movies', series: 'series', anime: 'anime', shortdrama: 'short dramas', other: 'other things' };
  const parts = [];
  const lang = f.language ? languageName(f.language) : '';
  const types = f.types.map((t) => typeNames[t]);
  const shelves = f.shelves.map((s) => CATEGORY_LABEL[s]);
  const what = [...types, ...shelves].join(' & ') || (lang ? 'titles' : '');
  if (lang || what) parts.push([lang, what].filter(Boolean).join(' '));
  if (f.fav) parts.push('favourites');
  if (f.cinema) parts.push('seen in a cinema');
  if (f.statuses.length) parts.push(f.statuses.map((s) => statusLabel({}, s).toLowerCase()).join(' or '));
  if (f.from || f.to) parts.push(f.from && f.to ? `${f.from}–${f.to}` : f.from ? `from ${f.from}` : `up to ${f.to}`);
  if (f.minRating) parts.push(`rated ${f.minRating}+`);
  const s = parts.join(', ');
  return s ? s[0].toUpperCase() + s.slice(1) : 'Everything';
}

const TYPE_WORD = { movie: 'Movie', series: 'Series', anime: 'Anime', shortdrama: 'Short drama' };
/** One readable row per entry. `full` adds the longer columns. */
export function exportRows(entries, { full = true, notes = false } = {}) {
  return entries.map((e, i) => {
    const row = {
      '#': i + 1,
      Title: e.title,
      Type: TYPE_WORD[typeOf(e)] || (kindInfo(e).noun || 'Other').replace(/^\w/, (c) => c.toUpperCase()),
      Shelf: CATEGORY_LABEL[e.category] || e.category || '',
      Status: statusLabel(e),
      Progress: isScreen(e) || e.episodes_watched ? progressLabel(e) : '',
      'My rating': e.rating != null ? Number(e.rating) : '',
      Favourite: e.favourite ? 'Yes' : '',
      Year: e.year || '',
      Language: e.original_language ? languageName(e.original_language) : '',
    };
    if (full) {
      Object.assign(row, {
        'Original title': e.original_title && e.original_title !== e.title ? e.original_title : '',
        Country: e.origin_country || '',
        Genres: (e.genres || []).join(', '),
        'Watched as': audioLabel(e) || '',
        Cinema: e.meta?.cinema ? 'Yes' : '',
        App: e.meta?.app || '',
        'By / where': !isScreen(e) ? e.meta?.by || '' : '',
        'Watched from': e.watched_from || '',
        'Watched to': e.watched_to || '',
        Rewatches: e.rewatch_count || '',
        Tags: (e.tags || []).join(', '),
        Review: e.review || '',
      });
      if (notes) row['Private notes'] = e.notes || '';
    }
    return row;
  });
}

const stamp = () => new Date().toISOString().slice(0, 10);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'list';
export const fileName = (title, ext) => `watchvault-${slug(title)}-${stamp()}.${ext}`;

function save(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------------- The four formats ---------------- */

export function toCsvText(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // The byte-order mark makes Excel read accents and non-Latin titles correctly.
  return '﻿' + [cols.map(esc).join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n');
}

export async function xlsxBlob(rows, title) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(rows);
  const cols = rows.length ? Object.keys(rows[0]) : [];
  ws['!cols'] = cols.map((c) => ({ wch: Math.min(48, Math.max(c.length + 2, ...rows.slice(0, 300).map((r) => String(r[c] ?? '').length + 1))) }));
  ws['!autofilter'] = { ref: ws['!ref'] || 'A1' };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'List');
  const summary = XLSX.utils.aoa_to_sheet([['WatchVault export'], ['What', title], ['Titles', rows.length], ['Made', new Date().toLocaleString()]]);
  summary['!cols'] = [{ wch: 18 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, summary, 'About');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// Word and PDF tables keep to the columns that fit on a page.
const PAGE_COLS = ['#', 'Title', 'Type', 'Status', 'Progress', 'My rating', 'Year', 'Language'];
const PAGE_WIDTHS = [4, 34, 10, 12, 18, 7, 6, 9]; // percent

export async function docxBlob(rows, title) {
  const d = await import('docx');
  const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, HeadingLevel, WidthType, PageOrientation, ShadingType, AlignmentType } = d;
  const cell = (text, head, w) =>
    new TableCell({
      width: { size: w, type: WidthType.PERCENTAGE },
      shading: head ? { type: ShadingType.CLEAR, color: 'auto', fill: 'EDE7DD' } : undefined,
      margins: { top: 40, bottom: 40, left: 80, right: 80 },
      children: [new Paragraph({ children: [new TextRun({ text: String(text ?? ''), bold: head, size: 18 })] })],
    });
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: PAGE_COLS.map((c, i) => cell(c, true, PAGE_WIDTHS[i])) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: PAGE_COLS.map((c, i) => cell(r[c], false, PAGE_WIDTHS[i])) })),
    ],
  });
  const doc = new Document({
    creator: 'WatchVault',
    title: `WatchVault: ${title}`,
    sections: [
      {
        properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
        children: [
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: title })] }),
          new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: `${rows.length} ${rows.length === 1 ? 'title' : 'titles'} · exported from WatchVault on ${new Date().toLocaleDateString()}`, color: '6B6B6B', size: 20 })] }),
          table,
          new Paragraph({ alignment: AlignmentType.LEFT, spacing: { before: 200 }, children: [new TextRun({ text: 'Need every column? Export as Excel or CSV.', color: '8A8A8A', size: 16 })] }),
        ],
      },
    ],
  });
  return Packer.toBlob(doc);
}

/** The PDF's built-in fonts only have Western letters: keep accents, drop what can't print. */
function printable(text, font) {
  const s = String(text ?? '').normalize('NFC');
  let out = '';
  for (const ch of s) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      const plain = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '');
      try {
        font.encodeText(plain);
        out += plain;
      } catch {
        /* not printable in this font */
      }
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

export async function pdfBlob(rows, title, originals = []) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  pdf.setTitle(`WatchVault: ${title}`);
  pdf.setCreator('WatchVault');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 842, H = 595, M = 36; // A4 landscape
  const widths = PAGE_WIDTHS.map((p) => ((W - M * 2) * p) / 100);
  const size = 8.5, line = 13;
  const ink = rgb(0.13, 0.13, 0.13), muted = rgb(0.45, 0.45, 0.45), band = rgb(0.95, 0.93, 0.89);
  const fit = (t, w, f = font) => {
    let s = t;
    if (f.widthOfTextAtSize(s, size) <= w - 6) return s;
    while (s.length > 1 && f.widthOfTextAtSize(s + '…', size) > w - 6) s = s.slice(0, -1);
    return s + '…';
  };
  let page, y, n = 0;
  const header = () => {
    page = pdf.addPage([W, H]);
    n += 1;
    y = H - M;
    if (n === 1) {
      page.drawText(printable(title, bold) || 'My list', { x: M, y: y - 14, size: 18, font: bold, color: ink });
      page.drawText(`${rows.length} ${rows.length === 1 ? 'title' : 'titles'} · WatchVault · ${new Date().toLocaleDateString()}`, { x: M, y: y - 30, size: 9, font, color: muted });
      y -= 48;
    }
    page.drawRectangle({ x: M, y: y - line + 3, width: W - M * 2, height: line + 2, color: band });
    let x = M;
    PAGE_COLS.forEach((c, i) => {
      page.drawText(c, { x: x + 3, y: y - 7, size, font: bold, color: ink });
      x += widths[i];
    });
    y -= line + 4;
    page.drawText(`${n}`, { x: W - M - 10, y: M / 2, size: 8, font, color: muted });
  };
  header();
  rows.forEach((r, idx) => {
    if (y < M + line) header();
    let x = M;
    PAGE_COLS.forEach((c, i) => {
      let text = printable(r[c], font);
      // A title in a script the font can't draw (Japanese, Hindi…): fall back to the original or a marker.
      if (c === 'Title' && !text) text = printable(originals[idx], font) || '(title in another script)';
      page.drawText(fit(text, widths[i]), { x: x + 3, y: y - 7, size, font, color: c === 'Title' ? ink : muted });
      x += widths[i];
    });
    y -= line;
    if (idx % 2 === 1) page.drawLine({ start: { x: M, y: y + 2 }, end: { x: W - M, y: y + 2 }, thickness: 0.3, color: band });
  });
  const bytes = await pdf.save();
  return new Blob([bytes], { type: 'application/pdf' });
}

/** Make the file and hand it to the browser. Returns the file name. */
export async function exportList(entries, { format, title, full = true, notes = false }) {
  const rows = exportRows(entries, { full: format === 'docx' || format === 'pdf' ? true : full, notes });
  const ext = FORMATS.find((x) => x.id === format)?.ext || 'csv';
  const name = fileName(title, ext);
  let blob;
  if (format === 'xlsx') blob = await xlsxBlob(rows, title);
  else if (format === 'docx') blob = await docxBlob(rows, title);
  else if (format === 'pdf') blob = await pdfBlob(rows, title, entries.map((e) => e.original_title));
  else blob = new Blob([toCsvText(rows)], { type: 'text/csv;charset=utf-8' });
  save(blob, name);
  return name;
}
