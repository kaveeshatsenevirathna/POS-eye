import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decimal, totals } from '../apps/api/src/money';

test('tax-exclusive checkout rounds discount and tax once', () => {
  const result = totals(decimal('20.01'), 15, '8.875', false);
  assert.equal(result.discount.toFixed(2), '3.00');
  assert.equal(result.tax.toFixed(2), '1.51');
  assert.equal(result.revenue.toFixed(2), '17.01');
  assert.equal(result.total.toFixed(2), '18.52');
});
test('inclusive tax is separated from revenue after discounts', () => {
  const result = totals(decimal('100'), 10, 20, true);
  assert.equal(result.tax.toFixed(2), '15.00');
  assert.equal(result.revenue.toFixed(2), '75.00');
  assert.equal(result.total.toFixed(2), '90.00');
});
