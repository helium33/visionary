import { Construction } from 'lucide-react';
import { Card, CardBody } from '../components/ui/Card';
import { PageHeader } from '../components/layout/AppShell';
import { useLocale } from '../context/LocaleContext';

/**
 * Honest stub. These routes exist so navigation and role-based menu filtering
 * are real and testable; the modules themselves are the next milestones and
 * are specified in docs/ARCHITECTURE.md.
 */
export default function Placeholder({ title, scope = [] }) {
  const { t } = useLocale();
  return (
    <>
      <PageHeader title={title ?? t('ui.notFound')} subtitle={t('ui.plannedModule')} />
      <Card>
        <CardBody>
          <div className="flex items-start gap-3">
            <Construction size={18} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
            <div>
              <p className="text-sm text-ink">{t('ui.plannedModuleBody')}</p>
              {scope.length ? (
                <ul className="mt-3 space-y-1 text-xs text-ink-secondary">
                  {scope.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="text-ink-muted">—</span>
                      {item}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
