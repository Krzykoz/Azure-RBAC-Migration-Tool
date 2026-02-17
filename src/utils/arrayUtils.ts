/**
 * Processes items in chunks with a given processor function
 * @param items - Array of items to process
 * @param chunkSize - Number of items per chunk
 * @param processor - Async function to process each chunk
 * @returns Combined results from all chunks
 */
export const processInChunks = async <T, R>(
    items: T[],
    chunkSize: number,
    processor: (chunk: T[]) => Promise<R[]>
): Promise<R[]> => {
    const results: R[] = [];

    for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        const chunkResults = await processor(chunk);
        results.push(...chunkResults);
    }

    return results;
};
