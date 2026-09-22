import { Fragment } from 'react';
import { Check } from 'lucide-react';
import { buildPermissionMatrix, roleLabel, ROLE_ORDER } from '../../domain/permissions';

/**
 * The permission matrix, read-only. This is a mirror of `lib/constants.js`,
 * not a second source of truth — nothing here can be edited, because editing
 * it would mean the screen and the security rules could drift apart. What a
 * role can do changes by changing that one list and redeploying the rules,
 * not by clicking a checkbox.
 */
export function RoleMatrix() {
  const matrix = buildPermissionMatrix();

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-line-hair text-left text-2xs text-ink-secondary">
            <th className="px-4 py-2 font-medium">Capability</th>
            {ROLE_ORDER.map((role) => (
              <th key={role} className="px-2 py-2 text-center font-medium">
                {roleLabel(role)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((section) => (
            <Fragment key={section.group}>
              <tr className="bg-raised/60">
                <td colSpan={ROLE_ORDER.length + 1} className="px-4 py-1.5 text-2xs font-semibold text-ink">
                  {section.group}
                </td>
              </tr>
              {section.rows.map((row) => (
                <tr key={row.key} className="border-b border-line-hair last:border-0">
                  <td className="px-4 py-2 text-ink-secondary">{row.label}</td>
                  {ROLE_ORDER.map((role) => (
                    <td key={role} className="px-2 py-2 text-center">
                      {row.grants[role] ? (
                        <Check size={14} className="mx-auto text-status-good" aria-hidden="true" />
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
