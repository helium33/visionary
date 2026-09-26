import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Receipt } from 'lucide-react';
import { EXPENSE_CATEGORIES } from '../../domain/purchasing';
import { tOr } from '../../i18n/translate';
import { recordExpense } from '../../services/purchasingService';
import { fmtDate } from '../../lib/dates';
import { fmtMMK } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
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
  const { t } = useLocale();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const categoryLabel = (key) =>
    tOr(t, `purchasing.expenseCategory.${key}`, EXPENSE_CATEGORIES[key] ?? key);
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
    toast.push(t('purchasing.expenseRecorded', { amount: fmtMMK(result.expense.amount) }), {
      tone: 'success',
    });
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
              {t('purchasing.entriesInPeriod', { count: summary.count, amount: fmtMMK(summary.total) })}
            </p>
            <Button size="sm" variant={adding ? 'quiet' : 'secondary'} icon={Plus} onClick={() => setAdding((v) => !v)}>
              {adding ? t('common.cancel') : t('purchasing.addExpense')}
            </Button>
          </div>

          {adding ? (
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="mb-3 grid gap-2 rounded-card border border-line-hair p-3 sm:grid-cols-4"
            >
              <label className="sm:col-span-1">
                <span className="mb-1 block text-2xs font-medium text-ink">{t('purchasing.category')}</span>
                <select
                  {...register('category')}
                  className="h-9 w-full rounded-md border border-line-hair bg-surface px-2 text-sm text-ink outline-none"
                >
                  {Object.keys(EXPENSE_CATEGORIES).map((key) => (
                    <option key={key} value={key}>
                      {categoryLabel(key)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="sm:col-span-2">
                <span className="mb-1 block text-2xs font-medium text-ink">{t('purchasing.description')}</span>
                <input
                  {...register('description', { required: true })}
                  placeholder={t('purchasing.descriptionPlaceholder')}
                  className="h-9 w-full rounded-md border border-line-hair bg-surface px-2 text-sm text-ink outline-none"
                />
              </label>

              <label className="sm:col-span-1">
                <span className="mb-1 block text-2xs font-medium text-ink">{t('purchasing.amountMmk')}</span>
                <input
                  {...register('amount', { required: true })}
                  inputMode="numeric"
                  placeholder="0"
                  className="h-9 w-full rounded-md border border-line-hair bg-surface px-2 text-sm tabular-nums text-ink outline-none"
                />
              </label>

              <label className="sm:col-span-2">
                <span className="mb-1 block text-2xs font-medium text-ink">{t('purchasing.date')}</span>
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
                  {isSubmitting ? t('common.saving') : t('purchasing.recordExpense')}
                </Button>
              </div>
            </form>
          ) : null}

          {summary.rows.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title={t('purchasing.noExpenses')}
              description={t('purchasing.noExpensesHint')}
            />
          ) : (
            <div className="overflow-x-auto rounded-card border border-line-hair">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-line-hair text-left text-2xs text-ink-secondary">
                    <th className="px-3 py-2 font-medium">{t('purchasing.colDate')}</th>
                    <th className="px-3 py-2 font-medium">{t('purchasing.colCategory')}</th>
                    <th className="px-3 py-2 font-medium">{t('purchasing.colDescription')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('purchasing.colAmount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.map((expense) => (
                    <tr key={expense.id} className="border-b border-line-hair last:border-0">
                      <td className="whitespace-nowrap px-3 py-2 text-ink-secondary">
                        {fmtDate(expense.date, 'dd MMM')}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-2xs text-ink-secondary">
                        {categoryLabel(expense.category)}
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
          <p className="mb-2 text-xs font-medium text-ink">{t('purchasing.byCategory')}</p>
          <BarList
            rows={summary.byCategory.map((row) => ({ ...row, label: categoryLabel(row.key) }))}
            valueLabel={t('purchasing.expensesLabel')}
            emptyLabel={t('purchasing.nothingRecorded')}
          />
        </div>
      </div>
    </div>
  );
}
