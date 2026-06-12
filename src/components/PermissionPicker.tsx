import { For, type JSX } from 'solid-js';
import { LEGACY_KEY_VAULT_PERMISSIONS } from '../utils/permissionDefinitions';
import { Checkbox } from './ui';
import {
    CATEGORY_ORDER,
    CATEGORY_LABELS,
    Category,
    CategorySelection,
} from '../utils/permissionCategories';

interface PermissionPickerProps {
    selected: CategorySelection;
    totalSelected: number;
    onTogglePermission: (cat: Category, perm: string) => void;
    onToggleCategoryAll: (cat: Category) => void;
    onClearAll: () => void;
}

export const PermissionPicker = (props: PermissionPickerProps): JSX.Element => {
    return (
        <div>
            <div class="flex items-center justify-between mb-3">
                <h3 class="text-sm font-bold text-neutral-800 dark:text-neutral-200">
                    Select permissions{' '}
                    <span class="font-normal text-neutral-500">({props.totalSelected} selected)</span>
                </h3>
                <button
                    onClick={() => props.onClearAll()}
                    class="text-xs text-neutral-500 hover:text-brand-600 transition-colors"
                >
                    Clear all
                </button>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
                <For each={CATEGORY_ORDER}>
                    {(cat) => {
                        const all = LEGACY_KEY_VAULT_PERMISSIONS[cat] || [];
                        const selCount = () => props.selected[cat].size;
                        const allSelected = () => selCount() > 0 && selCount() === all.length;
                        const partiallySelected = () => selCount() > 0 && selCount() < all.length;

                        return (
                            <div class="border border-neutral-200 dark:border-neutral-700 rounded p-3 bg-neutral-50/50 dark:bg-neutral-900/30">
                                <div class="flex items-center gap-2 mb-2 pb-2 border-b border-neutral-200 dark:border-neutral-700">
                                    <Checkbox
                                        checked={allSelected()}
                                        indeterminate={partiallySelected()}
                                        onChange={() => props.onToggleCategoryAll(cat)}
                                    />
                                    <span class="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                                        {CATEGORY_LABELS[cat]}
                                    </span>
                                    <span class="text-xs text-neutral-400 ml-auto">
                                        {selCount()}/{all.length}
                                    </span>
                                </div>
                                <div class="flex flex-col gap-1.5">
                                    <For each={all}>
                                        {(perm) => (
                                            <label class="flex items-center gap-2 cursor-pointer text-xs text-neutral-700 dark:text-neutral-300 select-none">
                                                <Checkbox
                                                    checked={props.selected[cat].has(perm)}
                                                    onChange={() => props.onTogglePermission(cat, perm)}
                                                />
                                                {perm}
                                            </label>
                                        )}
                                    </For>
                                </div>
                            </div>
                        );
                    }}
                </For>
            </div>
        </div>
    );
};
