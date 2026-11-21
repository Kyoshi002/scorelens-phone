const paths = {
  note: '<path d="M9 17V6l10-2v11M9 9l10-2"/><ellipse cx="6.5" cy="17.5" rx="2.5" ry="2"/><ellipse cx="16.5" cy="15.5" rx="2.5" ry="2"/>',
  brand:
    '<path d="M3 8V4h4m10 0h4v4M3 16v4h4m10 0h4v-4M10 15V9l6-2v6"/><ellipse cx="8.5" cy="15.5" rx="1.8" ry="1.4"/><ellipse cx="14.5" cy="13.5" rx="1.8" ry="1.4"/>',
  focus: '<path d="M8 3H4v4m12-4h4v4M4 17v4h4m12-4v4h-4M7 12h10"/>',
  piano:
    '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M7 5v8m4-8v8m5-8v8M8.5 13v6m5-9v9m5-7v7"/>',
  camera:
    '<path d="M3 8a1 1 0 0 1 1-1h3l1.7-3h6.6L17 7h3a1 1 0 0 1 1 1v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><circle cx="12" cy="13" r="3.8"/>',
  upload: '<path d="M12 15V3m-4 4 4-4 4 4M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  book: '<path d="M12 6c-2-2-5-2-9-2v14c4 0 7 0 9 2 2-2 5-2 9-2V4c-4 0-7 0-9 2v14"/>',
  bookmark: '<path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4Z"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  bulb: '<path d="M9 17c0-3-3.2-3.8-3.2-7.2a6.2 6.2 0 0 1 12.4 0c0 3.4-3.2 4.2-3.2 7.2Zm1 3h4"/>',
  left: '<path d="m14 5-7 7 7 7"/>',
  right: '<path d="m10 5 7 7-7 7"/>',
  play: '<path d="m6 4 13 8-13 8Z" fill="currentColor"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor"/>'
}
export function icon(name) {
  return (
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
    paths[name] +
    '</svg>'
  )
}
export function hydrateIcons() {
  document.querySelectorAll('i[data-icon]').forEach((el) => (el.innerHTML = icon(el.dataset.icon)))
}
