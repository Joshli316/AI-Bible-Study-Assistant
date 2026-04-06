import { search, SearchRequest } from './search';

interface Env {
  AI: Ai;
  VECTORIZE: VectorizeIndex;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

const SERIES_LIST = [
  'Ancient Christian Commentary on Scripture',
  'Baker Exegetical Commentary on the New Testament',
  'Bible Exposition Commentary',
  'Bible Knowledge Commentary',
  'Christ-Centered Exposition',
  'Daily Study Bible Series',
  'ESV',
  'Expositors Bible Commentary',
  'For Everyone NT Wright',
  'Holman Commentary',
  'IVP Bible Background Commentary',
  'Life Application Bible Commentary',
  'MacArthur NT Commentary',
  'New American Commentary',
  'New International Biblical Commentary',
  'New International Commentary',
  'Other Reference',
  'Preaching The Word',
  'Swindolls Living Insights',
  'Teach The Text',
  'The NIV Application Commentary',
  'Theology Of Work',
  'Thru The Bible',
  'Understanding The Bible',
  'Word Biblical Commentary',
];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    try {
      // POST /api/search
      if (url.pathname === '/api/search' && request.method === 'POST') {
        const body = (await request.json()) as SearchRequest;
        if (!body.query || typeof body.query !== 'string') {
          return json({ error: 'query is required' }, 400);
        }
        const results = await search(body, env.AI, env.VECTORIZE);
        return json({ results });
      }

      // GET /api/series
      if (url.pathname === '/api/series') {
        return json({ series: SERIES_LIST });
      }

      // GET /api/stats
      if (url.pathname === '/api/stats') {
        const described = await env.VECTORIZE.describe();
        return json({
          totalVectors: described.vectorCount,
          seriesCount: SERIES_LIST.length,
          totalFiles: 567,
        });
      }

      return json({ error: 'Not found' }, 404);
    } catch (err: any) {
      console.error('Worker error:', err);
      return json({ error: err.message || 'Internal error' }, 500);
    }
  },
};
