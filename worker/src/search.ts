export interface SearchRequest {
  query: string;
  limit?: number;
  filters?: {
    series?: string;
    testament?: string;
    book?: string;
  };
}

export interface SearchResult {
  text: string;
  series: string;
  testament: string;
  book: string;
  filename: string;
  pageNumber: number;
  score: number;
}

export async function search(
  request: SearchRequest,
  ai: Ai,
  vectorize: VectorizeIndex
): Promise<SearchResult[]> {
  const { query, limit = 10, filters } = request;

  // Embed the query
  const embedding = await ai.run('@cf/baai/bge-base-en-v1.5', {
    text: [query],
  });

  const queryVector = ((embedding as { data: number[][] }).data)[0];

  // Build Vectorize query with optional metadata filters
  const vectorizeFilter: Record<string, string> = {};
  if (filters?.series) vectorizeFilter.series = filters.series;
  if (filters?.testament) vectorizeFilter.testament = filters.testament;
  if (filters?.book) vectorizeFilter.book = filters.book;

  const results = await vectorize.query(queryVector, {
    topK: limit,
    returnMetadata: 'all',
    ...(Object.keys(vectorizeFilter).length > 0 ? { filter: vectorizeFilter } : {}),
  });

  return results.matches.map((match) => ({
    text: (match.metadata?.text as string) || '',
    series: (match.metadata?.series as string) || '',
    testament: (match.metadata?.testament as string) || '',
    book: (match.metadata?.book as string) || '',
    filename: (match.metadata?.filename as string) || '',
    pageNumber: (match.metadata?.pageNumber as number) || 0,
    score: match.score,
  }));
}
