function isRealIsoDate(value) {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateExpenseInput(input = {}) {
  const category = String(input.category || '').trim().slice(0, 80);
  const description = String(input.description || '').trim().slice(0, 500);
  const amount = Number(input.amount);
  const expenseDate = String(input.expense_date || new Date().toISOString().slice(0, 10));
  const reference = String(input.reference || '').trim().slice(0, 100) || null;

  if (!category) return { error: 'Category is required' };
  if (!description) return { error: 'Description is required' };
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'Amount must be a positive number' };
  if (!isRealIsoDate(expenseDate)) return { error: 'Expense date must be a valid YYYY-MM-DD date' };

  return { value: { category, description, amount, expenseDate, reference } };
}

module.exports = { isRealIsoDate, validateExpenseInput };
