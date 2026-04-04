import type { MarkdownInlineToken, MarkdownSegment } from '../types';

const orderedListPattern = /^\d+\.\s+/;
const bulletListPattern = /^[-*]\s+/;

function parseInline(text: string): MarkdownInlineToken[] {
  const tokens: MarkdownInlineToken[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const remaining = text.slice(cursor);

    if (remaining.startsWith('`')) {
      const close = remaining.indexOf('`', 1);
      if (close > 0) {
        tokens.push({ kind: 'code', text: remaining.slice(1, close) });
        cursor += close + 1;
        continue;
      }
    }

    if (remaining.startsWith('**')) {
      const close = remaining.indexOf('**', 2);
      if (close > 1) {
        tokens.push({ kind: 'bold', text: remaining.slice(2, close) });
        cursor += close + 2;
        continue;
      }
    }

    if (remaining.startsWith('*')) {
      const close = remaining.indexOf('*', 1);
      if (close > 0) {
        tokens.push({ kind: 'italic', text: remaining.slice(1, close) });
        cursor += close + 1;
        continue;
      }
    }

    if (remaining.startsWith('[')) {
      const labelClose = remaining.indexOf('](');
      const hrefClose = labelClose > 0 ? remaining.indexOf(')', labelClose + 2) : -1;
      if (labelClose > 0 && hrefClose > labelClose + 2) {
        tokens.push({
          kind: 'link',
          text: remaining.slice(1, labelClose),
          href: remaining.slice(labelClose + 2, hrefClose),
        });
        cursor += hrefClose + 1;
        continue;
      }
    }

    const nextControl = findNextControlIndex(remaining);
    const end = nextControl === -1 ? remaining.length : nextControl;
    tokens.push({ kind: 'text', text: remaining.slice(0, end) });
    cursor += end;
  }

  return tokens;
}

function findNextControlIndex(input: string): number {
  const candidates = [
    input.indexOf('`'),
    input.indexOf('**'),
    input.indexOf('*'),
    input.indexOf('['),
  ].filter((index) => index >= 0);

  if (candidates.length === 0) {
    return -1;
  }

  return Math.min(...candidates);
}

function parseHeading(line: string): MarkdownSegment | null {
  const match = line.match(/^(#{1,6})\s+(.*)$/);
  if (!match) {
    return null;
  }

  const level = match[1].length as 1 | 2 | 3 | 4 | 5 | 6;
  return {
    kind: 'heading',
    level,
    inlines: parseInline(match[2]),
  };
}

function parseCodeFence(lines: string[], startIndex: number): { segment: MarkdownSegment; nextIndex: number } {
  const firstLine = lines[startIndex];
  const language = firstLine.slice(3).trim();
  const codeLines: string[] = [];
  let index = startIndex + 1;

  while (index < lines.length && !lines[index].startsWith('```')) {
    codeLines.push(lines[index]);
    index += 1;
  }

  const nextIndex = index < lines.length ? index + 1 : index;
  return {
    segment: {
      kind: 'code',
      language,
      code: codeLines.join('\n'),
    },
    nextIndex,
  };
}

function parseList(lines: string[], startIndex: number, ordered: boolean): { segment: MarkdownSegment; nextIndex: number } {
  const items: MarkdownInlineToken[][] = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    const pattern = ordered ? orderedListPattern : bulletListPattern;

    if (!pattern.test(line)) {
      break;
    }

    const itemText = line.replace(pattern, '');
    items.push(parseInline(itemText));
    index += 1;
  }

  return {
    segment: {
      kind: 'list',
      ordered,
      items,
    },
    nextIndex: index,
  };
}

function parseParagraph(lines: string[], startIndex: number): { segment: MarkdownSegment; nextIndex: number } {
  const paragraphLines: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];

    if (
      line.trim() === '' ||
      line.startsWith('```') ||
      /^#{1,6}\s+/.test(line) ||
      orderedListPattern.test(line) ||
      bulletListPattern.test(line)
    ) {
      break;
    }

    paragraphLines.push(line);
    index += 1;
  }

  return {
    segment: {
      kind: 'paragraph',
      inlines: parseInline(paragraphLines.join(' ')),
    },
    nextIndex: index,
  };
}

export function parseMarkdownToSegments(markdown: string): MarkdownSegment[] {
  const lines = markdown.split(/\r?\n/);
  const segments: MarkdownSegment[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === '') {
      index += 1;
      continue;
    }

    if (line.startsWith('```')) {
      const codeFence = parseCodeFence(lines, index);
      segments.push(codeFence.segment);
      index = codeFence.nextIndex;
      continue;
    }

    const heading = parseHeading(line);
    if (heading) {
      segments.push(heading);
      index += 1;
      continue;
    }

    if (orderedListPattern.test(line)) {
      const list = parseList(lines, index, true);
      segments.push(list.segment);
      index = list.nextIndex;
      continue;
    }

    if (bulletListPattern.test(line)) {
      const list = parseList(lines, index, false);
      segments.push(list.segment);
      index = list.nextIndex;
      continue;
    }

    const paragraph = parseParagraph(lines, index);
    segments.push(paragraph.segment);
    index = paragraph.nextIndex;
  }

  return segments;
}
