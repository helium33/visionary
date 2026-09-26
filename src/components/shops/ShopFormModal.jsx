import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Save } from 'lucide-react';
import { districtLabel, getDistrictForTownship, townshipLabel } from '../../constants/districts';
import { PRICE_TIERS, TOWNSHIP_NAMES } from '../../lib/constants';
import { createShop, updateShop } from '../../services/shopService';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { useToast } from '../ui/Toast';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

/**
 * Create or edit a shop. Township drives district the moment it's picked —
 * `district` is never a field this form writes, only ever
 * `getDistrictForTownship(township)`'s return value shown back for
 * confirmation, the same auto-categorisation the brief asked for.
 */
export function ShopFormModal({ open, shop, reps = [], onClose, onSaved }) {
  const { user } = useAuth();
  const { t, locale } = useLocale();
  const toast = useToast();
  const isEdit = Boolean(shop);
  const { register, handleSubmit, watch, reset, formState: { isSubmitting } } = useForm({
    defaultValues: {
      name: '',
      nameMM: '',
      township: TOWNSHIP_NAMES[0],
      ownerName: '',
      phone: '',
      priceTier: 'STANDARD',
      creditLimit: '',
      creditTermDays: '14',
      salesRepId: user?.role === 'SALES' ? (user.uid ?? user.id) : '',
    },
  });

  useEffect(() => {
    if (!open) return;
    reset(
      isEdit
        ? {
            name: shop.name ?? '',
            nameMM: shop.nameMM ?? '',
            township: shop.township ?? TOWNSHIP_NAMES[0],
            ownerName: shop.ownerName ?? '',
            phone: shop.phone ?? '',
            priceTier: shop.priceTier ?? 'STANDARD',
            creditLimit: String(shop.creditLimit ?? ''),
            creditTermDays: String(shop.creditTermDays ?? '14'),
            salesRepId: shop.salesRepId ?? '',
          }
        : {
            name: '',
            nameMM: '',
            township: TOWNSHIP_NAMES[0],
            ownerName: '',
            phone: '',
            priceTier: 'STANDARD',
            creditLimit: '',
            creditTermDays: '14',
            salesRepId: user?.role === 'SALES' ? (user.uid ?? user.id) : '',
          },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shop]);

  const township = watch('township');
  const district = getDistrictForTownship(township);

  // Credit limit and price tier are unrestricted while creating a shop
  // (firestore.rules only fences credit.override, and only on update), but
  // editing them on an EXISTING shop is reserved for ADMIN/ACCOUNTANT or
  // that shop's own rep. A SALES rep who isn't this shop's rep never reaches
  // this modal at all (the profile panel that opens it already hides the
  // edit action), but the fields are still disabled here as a second guard.
  const canEditTerms =
    !isEdit ||
    user?.role === 'ADMIN' ||
    user?.role === 'ACCOUNTANT' ||
    shop?.salesRepId === (user?.uid ?? user?.id);

  const onSubmit = async (values) => {
    const payload = {
      name: values.name.trim(),
      nameMM: values.nameMM.trim(),
      township: values.township,
      ownerName: values.ownerName.trim(),
      phone: values.phone.trim(),
      priceTier: values.priceTier,
      creditLimit: values.creditLimit,
      creditTermDays: values.creditTermDays,
      salesRepId: values.salesRepId || null,
    };

    let result;
    try {
      result = isEdit
        ? await updateShop({ shopId: shop.id, patch: payload, actor: user })
        : await createShop({ ...payload, actor: user });
    } catch {
      // A rules rejection or a dropped connection throws rather than
      // returning { ok: false } — either way the user needs to hear it.
      result = { ok: false };
    }

    if (!result.ok) {
      toast.push(result.message ?? t('shops.saveFailed'), { tone: 'error' });
      return;
    }
    toast.push(t(isEdit ? 'shops.updated' : 'shops.added', { shop: payload.name }), { tone: 'success' });
    onSaved?.(result.shop);
    onClose();
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-lg"
      title={isEdit ? t('shops.editTitle', { shop: shop.name }) : t('shops.addTitle')}
      subtitle={isEdit ? shop.code : t('shops.addSubtitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" icon={Save} disabled={isSubmitting} onClick={handleSubmit(onSubmit)}>
            {isSubmitting ? t('common.saving') : isEdit ? t('shops.saveChanges') : t('shops.addShop')}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('shops.fieldName')}>
            <input
              className="input"
              autoFocus
              {...register('name', { required: true })}
            />
          </Field>
          <Field label={t('shops.fieldNameMM')}>
            <input className="input" {...register('nameMM')} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('shops.fieldOwner')}>
            <input className="input" {...register('ownerName')} />
          </Field>
          <Field label={t('shops.fieldPhone')}>
            <input className="input" {...register('phone')} />
          </Field>
        </div>

        <Field
          label={t('shops.fieldTownship')}
          hint={district ? districtLabel(district, locale) : t('shops.districtUnknown')}
        >
          <select className="input" {...register('township', { required: true })}>
            {TOWNSHIP_NAMES.map((name) => (
              <option key={name} value={name}>
                {townshipLabel(name, locale)}
              </option>
            ))}
          </select>
        </Field>

        {reps.length > 0 ? (
          <Field label={t('shops.fieldRep')}>
            <select className="input" disabled={user?.role === 'SALES'} {...register('salesRepId')}>
              <option value="">{t('shops.unassigned')}</option>
              {reps.map((rep) => (
                <option key={rep.id} value={rep.id}>
                  {rep.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('shops.fieldTier')}>
            <select className="input" disabled={!canEditTerms} {...register('priceTier')}>
              {Object.values(PRICE_TIERS).map((tier) => (
                <option key={tier.key} value={tier.key}>
                  {t(`labels.priceTier.${tier.key}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('shops.fieldLimit')}>
            <input
              inputMode="numeric"
              className="input"
              disabled={!canEditTerms}
              {...register('creditLimit')}
            />
          </Field>
          <Field label={t('shops.fieldTerm')}>
            <input
              inputMode="numeric"
              className="input"
              disabled={!canEditTerms}
              {...register('creditTermDays')}
            />
          </Field>
        </div>

        {!canEditTerms ? (
          <p className="text-2xs text-ink-muted">{t('shops.termsLocked')}</p>
        ) : null}
      </form>
    </Modal>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-secondary">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-2xs text-ink-muted">{hint}</span> : null}
    </label>
  );
}
