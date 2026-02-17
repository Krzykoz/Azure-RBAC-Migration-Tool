/**
 * Toggles an item in a Set
 * @param set - The set to toggle the item in
 * @param item - The item to toggle
 * @returns A new Set with the item toggled
 */
export const toggleSetItem = <T>(set: Set<T>, item: T): Set<T> => {
    const next = new Set(set);
    if (next.has(item)) {
        next.delete(item);
    } else {
        next.add(item);
    }
    return next;
};

/**
 * Toggles multiple items in a Set based on whether all are selected
 * @param set - The set to toggle items in
 * @param items - The items to toggle
 * @returns A new Set with the items toggled
 */
export const toggleSetItems = <T>(set: Set<T>, items: T[]): Set<T> => {
    const next = new Set(set);
    const allSelected = items.every(item => set.has(item));
    
    if (allSelected) {
        items.forEach(item => next.delete(item));
    } else {
        items.forEach(item => next.add(item));
    }
    
    return next;
};
