import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Receipt } from 'lucide-react';
import { EXPENSE_CATEGORIES } from '../../domain/purchasing';
import { recordExpense } from '../../services/purchasingService';
import { fmtDate } from '../../lib/dates';
import { fmtMMK } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../ui/Toast';
import { BarList } from '../charts/BarList';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';

/**
 * General expenses — salaries, rent, utilities, fees.
 *
 * These are the other half of net profit: revenue minus cost of goods minus
 * this. Kept beside purchasing because both are money going out, and the
 * accountant enters them in the same sitting.
 */
export function ExpensesPanel({ summary, onRecorded }) {
  const { user } = useAuth();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm({
    defaultValues: {
      category: 'OFFICE',
      description: '',
      amount: '',
      date: new Date().toISOString().slice(0, 10),
    },
  });

  const onSubmit = async (values) => {
    const result = await recordExpense({
      expense: {
        ...values,
        amount: Number(String(values.amount).replace(/[^\d]/g, '')) || 0,
        date: new Date(values.date).toISOString(),
      },
      actor: user,
    });

    if (!result.ok) {
      toast.push(result.message, { tone: 'error' });
      return;
    }
    toast.push(`Expense recorded · K ${fmtMMK(result.expense.amount)}`, { tone: 'success' });
    reset();
    setAdding(false);
    onRecorded?.(result.expense);
  };

  return (
    <div className="space-y-4 p-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-ink">
              {summary.count} entries · K {fmtMMK(summary.total)} in this period
            </p>
            <Button size="sm" variant={adding ? 'quiet' : 'secondary'} icon={Plus} onClick={() => setAdding((v) => !v)}>
              {adding ? 'Cancel' : 'Add expense'}
            </Button>
          </div>

          {adding ? (
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="mb-3 grid gap-2 rounded-card border border-line-hair p-3 sm:grid-cols-4"
            >
              <label className="sm:col-span-1">
                <span className="mb-1 block text-2xs font-medium text-ink">Category</span>
                <select
                  {...register('category')}
                  className="h-9 w-full rounded-md border border-line-hair bg-surface px-2 text-sm text-ink outline-none"
                >
                  {Object.entries(EXPENSE_CATEGORIES).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="sm:col-span-2">
                <span className="mb-1 block text-2xs font-medium text-ink">Description</span>
                <input
                  {...register('description', { required: true })}
                  placeholder="e.g. September electricity"
                  className="h-9 w-full rounded-md border border-line-hair bg-surface px-2 text-sm text-ink outline-none"
                />
              </label>

              <label className="sm:col-span-1">
                <span className="mb-1 block text-2xs font-medium text-ink">Amount (MMK)</span>
                <input
                  {...register('amount', { required: true })}
                  inputMode="numeric"
                  placeholder="0"
                  className="h-9 w-full rounded-md border border-line-hair bg-surface px-2 text-sm tabular-nums text-ink outline-none"
                />
              </label>

              <label className="sm:col-span-2">
                <span className="mb-1 block text-2xs font-medium text-ink">Date</span>
                <input
                  type="date"
                  {...register('date')}
                  className="h-9 w-full rounded-md border border-line-hair bg-surface px-2 text-sm text-ink outline-none"
                />
              </label>

              <div className="flex items-end sm:col-span-2">
                <Button
                  variant="primary"
                  className="w-full"
                  disabled={isSubmitting}
                  onClick={handleSubmit(onSubmit)}
                >
                  {isSubmitting ? 'Saving…' : 'Record expense'}
                </Button>
              </div>
            </form>
          ) : null}

          {summary.rows.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No expenses in this period"
              description="Salaries, rent, utilities and fees all belong here — net profit is wrong without them."
            />
          ) : (
            <div className="overflow-x-auto rounded-card border border-line-hair">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-line-hair text-left text-2xs text-ink-secondary">
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 font-medium">Description</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.map((expense) => (
                    <tr key={expense.id} className="border-b border-line-hair last:border-0">
                      <td className="whitespace-nowrap px-3 py-2 text-ink-secondary">
                        {fmtDate(expense.date, 'dd MMM')}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-2xs text-ink-secondary">
                        {EXPENSE_CATEGORIES[expense.category] ?? expense.category}
                      </td>
                      <td className="px-3 py-2 text-ink">{expense.description}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums text-ink">
                        {fmtMMK(expense.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-ink">By category</p>
          <BarList
            rows={summary.byCategory.map((row) => ({ ...row, key: row.label }))}
            valueLabel="Expenses"
            emptyLabel="Nothing recorded"
          />
        </div>
      </div>
    </div>
  );
}
