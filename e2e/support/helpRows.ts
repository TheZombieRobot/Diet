import type { Page } from '@playwright/test';

/**
 * Help and emergency number rows (tap-to-call and tap-to-text; HS-13) that cannot be read at a
 * glance: a word or a phone number split across lines, or text running past the row's edge. At
 * 200% text on a 360 px phone (180 px) these rows once broke into columns a few letters wide
 * (full review F19), which the sideways-scroll and 48 px checks did not catch.
 */
export function helpRowProblems(page: Page, where: string): Promise<string[]> {
  return page.evaluate((label) => {
    const problems: string[] = [];
    const rows = document.querySelectorAll<HTMLElement>(
      'a.ui-action-row[href^="tel:"], a.ui-action-row[href^="sms:"]',
    );
    for (const row of rows) {
      const edge = row.getBoundingClientRect();
      if (edge.width === 0) continue;
      const name = row.textContent.replace(/\s+/g, ' ').trim();
      for (const part of row.querySelectorAll('.ui-action-row__title, .ui-action-row__detail')) {
        const node = part.firstChild;
        if (node === null || node.nodeType !== Node.TEXT_NODE) continue;
        const text = node.textContent ?? '';
        // Each word, and each phone number as a whole (digits joined by single spaces).
        const units = [...text.matchAll(/\d+(?: \d+)+|\S+/g)];
        for (const unit of units) {
          const range = document.createRange();
          range.setStart(node, unit.index);
          range.setEnd(node, unit.index + unit[0].length);
          const boxes = [...range.getClientRects()].filter((b) => b.width > 0);
          const lines = new Set(boxes.map((b) => Math.round(b.top)));
          if (lines.size > 1) problems.push(`${label}: "${unit[0]}" is split in "${name}"`);
          for (const box of boxes) {
            if (box.left < edge.left - 0.5 || box.right > edge.right + 0.5) {
              problems.push(`${label}: "${unit[0]}" runs past the edge of "${name}"`);
            }
          }
        }
      }
    }
    return problems;
  }, where);
}
