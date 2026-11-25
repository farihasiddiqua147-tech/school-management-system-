const test = require('node:test');
const assert = require('node:assert/strict');
const { isRealIsoDate, validateExpenseInput } = require('./expense-validation');

test('accepts a valid expense and normalizes user input', () => {
  const result = validateExpenseInput({
    category: '  Utilities  ',
    description: '  Electricity bill  ',
    amount: '1250.50',
    expense_date: '2026-11-25',
    reference: '  INV-42  '
  });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.value, {
    category: 'Utilities',
    description: 'Electricity bill',
    amount: 1250.5,
    expenseDate: '2026-11-25',
    reference: 'INV-42'
  });
});

test('rejects missing category or description', () => {
  assert.equal(validateExpenseInput({ description: 'Bill', amount: 1, expense_date: '2026-11-25' }).error, 'Category is required');
  assert.equal(validateExpenseInput({ category: 'Utilities', amount: 1, expense_date: '2026-11-25' }).error, 'Description is required');
});

test('rejects zero, negative, and non-numeric amounts', () => {
  for (const amount of [0, -1, 'nope', Infinity, NaN]) {
    assert.equal(validateExpenseInput({ category: 'Utilities', description: 'Bill', amount, expense_date: '2026-11-25' }).error, 'Amount must be a positive number');
  }
});

test('validates actual calendar dates, not just date-shaped strings', () => {
  assert.equal(isRealIsoDate('2026-02-28'), true);
  assert.equal(isRealIsoDate('2026-02-30'), false);
  assert.equal(isRealIsoDate('25-11-2026'), false);
  assert.equal(validateExpenseInput({ category: 'Utilities', description: 'Bill', amount: 1, expense_date: '2026-02-30' }).error, 'Expense date must be a valid YYYY-MM-DD date');
});

test('uses today when expense date is omitted and bounds free-text fields', () => {
  const result = validateExpenseInput({ category: 'X'.repeat(100), description: 'Y'.repeat(600), amount: 1 });
  assert.equal(result.value.category.length, 80);
  assert.equal(result.value.description.length, 500);
  assert.equal(isRealIsoDate(result.value.expenseDate), true);
});
