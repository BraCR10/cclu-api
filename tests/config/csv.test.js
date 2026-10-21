const test = require('node:test');
const assert = require('node:assert/strict');
const { csvCell, toCsv } = require('../../src/config/csv');

test('a value that would run as a formula is kept as text', () => {
  for (const value of ['=HYPERLINK("x")', '+50688451290', '-1', '@SUM(A1)']) {
    assert.equal(csvCell(value).replace(/^"|"$/g, '').startsWith("'"), true, value);
  }
});

test('a comma, a quote or a line break is quoted, and quotes are doubled', () => {
  assert.equal(csvCell('Solís, Mariana'), '"Solís, Mariana"');
  assert.equal(csvCell('El "Carmen"'), '"El ""Carmen"""');
  assert.equal(csvCell(null), '');
});

test('a file starts with the mark Excel needs to read accents', () => {
  assert.equal(toCsv(['Nombre'], [['Café']]), '\uFEFFNombre\r\nCafé\r\n');
});
