import { useEffect } from 'react';

const MIN_COLUMNS = 4; // narrower tables already fit a phone screen

// Header labels for each column index, expanding colSpan.
function headerLabels(table) {
  const rows = table.tHead?.rows;
  if (!rows?.length) return null;
  const labels = [];
  for (const cell of rows[rows.length - 1].cells) {
    const text = (cell.getAttribute('aria-label') || cell.innerText || '').replace(/\s+/g, ' ').trim();
    for (let i = 0; i < (cell.colSpan || 1); i += 1) labels.push(i === 0 ? text : '');
  }
  return labels;
}

function annotate(table) {
  if (table.closest('[data-no-stack]')) return;
  const labels = headerLabels(table);
  if (!labels || labels.length < MIN_COLUMNS) {
    table.classList.remove('rt');
    return;
  }
  table.classList.add('rt');
  for (const body of table.tBodies) {
    for (const row of body.rows) {
      let col = 0;
      for (const cell of row.cells) {
        const label = cell.colSpan > 1 ? '' : (labels[col] || '');
        if (cell.getAttribute('data-label') !== label) cell.setAttribute('data-label', label);
        col += cell.colSpan || 1;
      }
    }
  }
  if (table.tFoot) {
    for (const row of table.tFoot.rows) {
      let col = 0;
      for (const cell of row.cells) {
        const label = cell.colSpan > 1 ? '' : (labels[col] || '');
        if (cell.getAttribute('data-label') !== label) cell.setAttribute('data-label', label);
        col += cell.colSpan || 1;
      }
    }
  }
}

// Labels every table cell with its column header so CSS can turn wide tables into stacked
// cards on phones (see `.rt` in index.css). Covers hand-built tables, DataTable and modals.
// Opt a table out with a `data-no-stack` attribute on it or any ancestor.
export function useResponsiveTables() {
  useEffect(() => {
    let frame = 0;
    const run = () => {
      frame = 0;
      document.querySelectorAll('table').forEach(annotate);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(run); };
    run();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, []);
}

export default useResponsiveTables;
