/**
 * Serializa filas a CSV (RFC 4180) con BOM UTF-8 para que Excel muestre tildes.
 * Las celdas que empiezan con = + - @ se prefijan con ' para evitar inyección de fórmulas.
 */
export function toCsv(columns, rows) {
  const cell = value => {
    let text = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r;]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const header = columns.map(c => cell(c.label)).join(',');
  const body = rows.map(row => columns.map(c => cell(c.value(row))).join(','));
  return '﻿' + [header, ...body].join('\r\n') + '\r\n';
}
