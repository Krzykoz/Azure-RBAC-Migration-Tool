import React from 'react';
import { LEGACY_KEY_VAULT_PERMISSIONS } from '../../core/permissions/legacy';
import { Checkbox } from '../primitives/Checkbox';
import {
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  Category,
  CategorySelection,
} from '../../core/permissions/categories';

interface PermissionPickerProps {
  selected: CategorySelection;
  totalSelected: number;
  onTogglePermission: (cat: Category, perm: string) => void;
  onToggleCategoryAll: (cat: Category) => void;
  onClearAll: () => void;
}

export const PermissionPicker: React.FC<PermissionPickerProps> = ({
  selected,
  totalSelected,
  onTogglePermission,
  onToggleCategoryAll,
  onClearAll,
}) => {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-bold text-neutral-800 dark:text-neutral-200">
          Select permissions{' '}
          <span className="font-normal text-neutral-500">
            ({totalSelected} selected)
          </span>
        </h3>
        <button
          onClick={onClearAll}
          className="text-xs text-neutral-500 hover:text-brand-600 transition-colors"
        >
          Clear all
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
        {CATEGORY_ORDER.map((cat) => {
          const all = LEGACY_KEY_VAULT_PERMISSIONS[cat] || [];
          const selCount = selected[cat].size;
          const allSelected = selCount > 0 && selCount === all.length;
          const partiallySelected = selCount > 0 && selCount < all.length;

          return (
            <div
              key={cat}
              className="border border-neutral-200 dark:border-neutral-700 rounded p-3 bg-neutral-50/50 dark:bg-neutral-900/30"
            >
              <div className="flex items-center gap-2 mb-2 pb-2 border-b border-neutral-200 dark:border-neutral-700">
                <Checkbox
                  label={`Select all ${CATEGORY_LABELS[cat]} permissions`}
                  checked={allSelected}
                  indeterminate={partiallySelected}
                  onChange={() => onToggleCategoryAll(cat)}
                />
                <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                  {CATEGORY_LABELS[cat]}
                </span>
                <span className="text-xs text-neutral-400 ml-auto">
                  {selCount}/{all.length}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                {all.map((perm) => (
                  <label
                    key={perm}
                    className="flex items-center gap-2 cursor-pointer text-xs text-neutral-700 dark:text-neutral-300 select-none"
                  >
                    <Checkbox
                      label={`${CATEGORY_LABELS[cat]}: ${perm}`}
                      checked={selected[cat].has(perm)}
                      onChange={() => onTogglePermission(cat, perm)}
                    />
                    {perm}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
