// Unit tests for GST maths, and a parity check that the POS screen computes the same totals as the server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateLineGst, summarizeInvoice, round2 } from '../utils/gstCalculator.js';
import * as client from '../../client/src/utils/gst.js';

test('GST-01 intra-state line splits GST equally into CGST and SGST', () => {
  const l = calculateLineGst({ quantity: 2, unitPrice: 100, discountPercent: 10, gstRate: 18 });
  assert.deepEqual(
    { gross: l.grossAmount, disc: l.discountAmount, taxable: l.taxableAmount, cgst: l.cgst, sgst: l.sgst, igst: l.igst, total: l.totalAmount },
    { gross: 200, disc: 20, taxable: 180, cgst: 16.2, sgst: 16.2, igst: 0, total: 212.4 },
  );
});

test('GST-02 inter-state line uses IGST only', () => {
  const l = calculateLineGst({ quantity: 1, unitPrice: 50, gstRate: 12, isInterState: true });
  assert.equal(l.igst, 6); assert.equal(l.cgst, 0); assert.equal(l.sgst, 0); assert.equal(l.totalAmount, 56);
});

test('GST-03 odd paise go to SGST so CGST + SGST always equals the tax', () => {
  const l = calculateLineGst({ quantity: 1, unitPrice: 10.05, gstRate: 5 });
  assert.equal(round2(l.cgst + l.sgst), l.taxAmount);
});

test('GST-04 invoice total is rounded to the rupee with the round-off recorded', () => {
  const lines = [calculateLineGst({ quantity: 3, unitPrice: 33.33, gstRate: 18 }), calculateLineGst({ quantity: 1, unitPrice: 9.99, gstRate: 5 })];
  const s = summarizeInvoice(lines);
  assert.equal(s.grandTotal, Math.round(s.grandTotal));
  assert.equal(round2(s.taxableAmount + s.taxAmount + s.roundOff), s.grandTotal);
});

test('GST-05 zero-rated and 100% discount lines produce zero tax', () => {
  assert.equal(calculateLineGst({ quantity: 4, unitPrice: 25, gstRate: 0 }).taxAmount, 0);
  assert.equal(calculateLineGst({ quantity: 1, unitPrice: 99, discountPercent: 100, gstRate: 18 }).totalAmount, 0);
});

test('GST-06 the POS screen and the server compute identical invoices (2,000 random carts)', () => {
  let seed = 42;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const rates = [0, 5, 12, 18, 28];
  for (let n = 0; n < 2000; n++) {
    const inter = rnd() < 0.2;
    const items = Array.from({ length: 1 + Math.floor(rnd() * 8) }, () => ({
      quantity: 1 + Math.floor(rnd() * 12), unitPrice: round2(rnd() * 3000), discountPercent: rnd() < 0.3 ? Math.floor(rnd() * 25) : 0,
      gstRate: rates[Math.floor(rnd() * rates.length)], isInterState: inter,
    }));
    const server = summarizeInvoice(items.map((i) => calculateLineGst(i)));
    const ui = client.summarizeInvoice(items.map((i) => client.calculateLineGst(i)));
    assert.deepEqual(ui, server, `cart ${n} differs`);
  }
});
