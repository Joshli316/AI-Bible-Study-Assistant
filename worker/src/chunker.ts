export interface ChunkMetadata {
  series: string;
  testament: string;
  book: string;
  filename: string;
  pageNumber: number;
  chunkIndex: number;
}

export interface Chunk {
  id: string;
  text: string;
  metadata: ChunkMetadata;
}

const CHUNK_SIZE = 2000;
const CHUNK_OVERLAP = 200;

const OT_BOOKS = new Set([
  'genesis', 'exodus', 'leviticus', 'numbers', 'deuteronomy',
  'joshua', 'judges', 'ruth', '1samuel', '2samuel',
  '1kings', '2kings', '1chronicles', '2chronicles',
  'ezra', 'nehemiah', 'esther', 'job', 'psalms',
  'proverbs', 'ecclesiastes', 'songofsolomon', 'isaiah', 'jeremiah',
  'lamentations', 'ezekiel', 'daniel', 'hosea', 'joel',
  'amos', 'obadiah', 'jonah', 'micah', 'nahum',
  'habakkuk', 'zephaniah', 'haggai', 'zechariah', 'malachi',
]);

const NT_BOOKS = new Set([
  'matthew', 'mark', 'luke', 'john', 'acts',
  'romans', '1corinthians', '2corinthians', 'galatians', 'ephesians',
  'philippians', 'colossians', '1thessalonians', '2thessalonians',
  '1timothy', '2timothy', 'titus', 'philemon',
  'hebrews', 'james', '1peter', '2peter',
  '1john', '2john', '3john', 'jude', 'revelation',
]);

export function parseFilePath(filePath: string, vaultRoot: string): { series: string; testament: string; book: string; filename: string } {
  const relative = filePath.replace(vaultRoot, '').replace(/^\//, '');
  const parts = relative.split('/');
  const filename = parts[parts.length - 1].replace('.md', '');

  let series = parts[0];
  let testament = 'Unknown';
  let book = filename;

  // Detect testament from directory structure
  if (parts.length >= 3) {
    const dir = parts[parts.length - 2].toLowerCase();
    if (dir.includes('old testament') || dir === 'ot' || dir.endsWith(' ot')) {
      testament = 'OT';
    } else if (dir.includes('new testament') || dir === 'nt' || dir.endsWith(' nt')) {
      testament = 'NT';
    } else if (dir.includes('bible knowledge commentary ot')) {
      testament = 'OT';
    } else if (dir.includes('bible knowledge commentary nt')) {
      testament = 'NT';
    } else if (dir.includes('thru the bible ot')) {
      testament = 'OT';
    } else if (dir.includes('thru the bible nt')) {
      testament = 'NT';
    }
  }

  // Try to extract book name from filename
  // Strip common prefixes like "01BEC ", "01 BEC", number prefixes
  let cleanName = filename
    .replace(/^\d+[A-Za-z]?\s*/, '')  // leading numbers + optional letter
    .replace(/^[A-Z]{2,6}\s*/, '')     // series abbreviation
    .replace(/^(BEC|PTW|DSBS|MacANTC|EBC|NAC|NIC|NIBC|WBC|UTB|HC|LABC|CCE|ESV|NIVAC)\s*/i, '')
    .trim();

  // If still has series abbreviation stuck to book name
  cleanName = cleanName
    .replace(/^(BEC|PTW|DSBS|MacANTC|EBC|NAC|NIC|NIBC|WBC|UTB|HC|LABC|CCE|ESV|NIVAC)/i, '')
    .trim();

  if (cleanName) {
    book = cleanName;
  }

  // Infer testament from book name if not detected from directory
  if (testament === 'Unknown') {
    const normalized = book.toLowerCase().replace(/[\s\-_]/g, '').replace(/\d+$/, '');
    if (OT_BOOKS.has(normalized)) {
      testament = 'OT';
    } else if (NT_BOOKS.has(normalized)) {
      testament = 'NT';
    }
    // Check partial matches
    for (const b of OT_BOOKS) {
      if (normalized.includes(b) || b.includes(normalized)) {
        testament = 'OT';
        break;
      }
    }
    for (const b of NT_BOOKS) {
      if (normalized.includes(b) || b.includes(normalized)) {
        testament = 'NT';
        break;
      }
    }
  }

  return { series, testament, book, filename };
}

function cleanOcrArtifacts(text: string): string {
  return text
    .replace(/\n{4,}/g, '\n\n\n')        // collapse excessive blank lines
    .replace(/[ \t]{3,}/g, '  ')          // collapse excessive spaces
    .replace(/[^\S\n]{2,}/g, ' ')         // collapse inline whitespace
    .replace(/^[^\w\n]{1,2}$/gm, '')      // remove lines with only 1-2 non-word chars
    .trim();
}

export function chunkFile(content: string, filePath: string, vaultRoot: string): Chunk[] {
  const { series, testament, book, filename } = parseFilePath(filePath, vaultRoot);
  const chunks: Chunk[] = [];

  // Split by page markers and track page numbers
  const pagePattern = /<!-- Page (\d+) -->/g;
  const segments: { text: string; pageNumber: number }[] = [];

  let lastIndex = 0;
  let currentPage = 1;
  let match: RegExpExecArray | null;

  while ((match = pagePattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index);
      if (text.trim()) {
        segments.push({ text: text.trim(), pageNumber: currentPage });
      }
    }
    currentPage = parseInt(match[1], 10);
    lastIndex = match.index + match[0].length;
  }

  // Remaining content after last page marker
  if (lastIndex < content.length) {
    const text = content.slice(lastIndex);
    if (text.trim()) {
      segments.push({ text: text.trim(), pageNumber: currentPage });
    }
  }

  // Now chunk each segment
  let chunkIndex = 0;
  for (const segment of segments) {
    const cleaned = cleanOcrArtifacts(segment.text);
    if (cleaned.length < 50) continue; // skip tiny segments

    let start = 0;
    while (start < cleaned.length) {
      const end = Math.min(start + CHUNK_SIZE, cleaned.length);
      let chunkText = cleaned.slice(start, end);

      // Try to break at a sentence or paragraph boundary
      if (end < cleaned.length) {
        const lastParagraph = chunkText.lastIndexOf('\n\n');
        const lastSentence = chunkText.lastIndexOf('. ');
        const breakPoint = lastParagraph > CHUNK_SIZE * 0.6
          ? lastParagraph
          : lastSentence > CHUNK_SIZE * 0.6
            ? lastSentence + 1
            : end - start;

        if (breakPoint < end - start) {
          chunkText = cleaned.slice(start, start + breakPoint);
        }
      }

      if (chunkText.trim().length > 30) {
        const id = `${filename}-p${segment.pageNumber}-c${chunkIndex}`;
        chunks.push({
          id,
          text: chunkText.trim(),
          metadata: {
            series,
            testament,
            book,
            filename,
            pageNumber: segment.pageNumber,
            chunkIndex,
          },
        });
        chunkIndex++;
      }

      // Advance with overlap
      start += chunkText.length > CHUNK_OVERLAP ? chunkText.length - CHUNK_OVERLAP : chunkText.length;
    }
  }

  return chunks;
}
