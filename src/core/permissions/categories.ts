export const CATEGORY_ORDER = ['keys', 'secrets', 'certificates', 'storage'] as const;
export type Category = (typeof CATEGORY_ORDER)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  keys: 'Keys',
  secrets: 'Secrets',
  certificates: 'Certificates',
  storage: 'Storage',
};

export type CategorySelection = Record<Category, Set<string>>;

export const emptySelection = (): CategorySelection => ({
  keys: new Set(),
  secrets: new Set(),
  certificates: new Set(),
  storage: new Set(),
});
