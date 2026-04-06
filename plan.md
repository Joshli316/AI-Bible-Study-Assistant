# Implementation Plan: AI Bible Study Assistant

## Overview
A bilingual web app that lets users search 25 Bible commentary series (567 files, 9M+ lines) using natural language. Users can ask verse-specific questions ("What do commentaries say about Romans 8:28?") or thematic queries ("What do these authors teach about forgiveness?"). Results show relevant passages grouped by commentary series. Built entirely on Cloudflare's free tier: Workers AI for embeddings, Vectorize for vector search, Pages for the frontend.

## Design Spec

### Color Palette
- **Primary:** #1e3a5f (deep navy — scholarly, trustworthy)
- **Secondary:** #8b6914 (warm gold — classic Bible reference)
- **Accent:** #c9a84c (light gold — highlights, active states)
- **Background:** #faf8f5 (warm off-white — paper-like, easy on eyes)
- **Surface:** #ffffff (cards, result panels)
- **Text:** #2d2d2d (near-black body text)
- **Muted:** #6b7280 (secondary text, metadata)
- **Dark mode BG:** #1a1a2e
- **Dark mode Surface:** #242440
- **Dark mode Text:** #e8e6e3

### Typography
- **Headings:** Georgia, serif (classic, bookish)
- **Body/Results:** system-ui, -apple-system, sans-serif (readable)
- **Verse text:** Georgia italic (distinguishes Scripture from commentary)
- **Scale:** h1: 2rem, h2: 1.5rem, h3: 1.25rem, body: 1rem, small: 0.875rem

### Spacing
- Base unit: 8px
- Card padding: 24px
- Section gap: 32px
- Result card gap: 16px

### Component Style
- Cards: `box-shadow: 0 1px 3px rgba(0,0,0,0.1)`, `border-radius: 8px`, `border: 1px solid #e5e2de`
- Search input: 48px height, 12px padding, 8px border-radius, 2px border on focus (primary color)
- Buttons: 8px 20px padding, 6px border-radius, primary bg, white text

### Micro-interactions
- Search: 300ms debounce, skeleton loading placeholders
- Results: fade-in 200ms ease-out on load
- Hover on cards: translateY(-1px), shadow increase, 150ms ease
- Language toggle: smooth text swap, no page reload

## Steps

### Step 1: Scaffold Worker project
- `npm create cloudflare@latest worker` with TypeScript
- Configure `wrangler.toml` with Vectorize binding and Workers AI binding
- Create Vectorize index: `wrangler vectorize create bible-commentaries --dimensions=768 --metric=cosine`

### Step 2: Build the chunker (`worker/src/chunker.ts`)
- Read each markdown file from `vault/`
- Parse metadata from file path: series name, testament (OT/NT), book name
- Split into chunks of ~500 tokens (~2000 chars) with 200-char overlap
- Each chunk gets metadata: `{ series, testament, book, filename, pageNumber, chunkIndex }`
- Handle the `<!-- Page N -->` markers to track page numbers
- Strip OCR artifacts (orphan characters, excessive whitespace)

### Step 3: Build the ingest script (`worker/src/ingest.ts`)
- Read all 567 markdown files from vault/
- Run chunker on each file
- Batch embed chunks using Workers AI (`@cf/baai/bge-base-en-v1.5`, 768 dimensions)
- Upload vectors + metadata to Vectorize in batches of 100
- Log progress: files processed, chunks created, vectors uploaded
- Handle errors gracefully (log and continue)
- This is a one-time local script run via `wrangler dev` or a separate Node script

### Step 4: Build search API (`worker/src/search.ts` + `worker/src/index.ts`)
- POST `/api/search` — accepts `{ query: string, limit?: number, filters?: { series?, testament?, book? } }`
- Embed the query using Workers AI (same model)
- Query Vectorize with the embedding, optional metadata filters
- Return top-K results (default 10) with: chunk text, series, book, page number, relevance score
- GET `/api/series` — return list of all commentary series (for filter dropdown)
- GET `/api/stats` — return total chunks, total files, series count
- Add CORS headers for Pages frontend

### Step 5: Build the frontend (`frontend/`)
- Single-page HTML/TypeScript app
- **Header:** App title "Bible Study Assistant / 圣经学习助手", language toggle (EN/ZH), dark mode toggle
- **Search bar:** Large centered input, placeholder "Search commentaries... / 搜索注释...", optional filter dropdowns (series, testament)
- **Results area:** Cards showing:
  - Commentary series name (badge)
  - Book name + page reference
  - Chunk text with query terms highlighted
  - Relevance score (subtle)
- **Empty state:** Suggested queries ("Try: What does Romans 8:28 mean?" / "试试：罗马书 8:28 是什么意思？")
- **Loading state:** Skeleton cards
- **No results state:** Helpful message with suggestions
- All UI strings bilingual, toggled without page reload
- Dark mode support
- Responsive: works on mobile (375px), tablet (768px), desktop (1024px)

### Step 6: Deploy
- Deploy Worker: `cd worker && wrangler deploy`
- Deploy Pages: `wrangler pages deploy frontend/`
- Configure Pages custom domain if desired
- Curl production URL to confirm 200
- Test search end-to-end on live URL

### Step 7: Verify
- App loads on production URL
- Search returns relevant results for verse query ("Romans 8:28")
- Search returns relevant results for thematic query ("suffering")
- Filters work (by series, by testament)
- Language toggle switches all visible text
- Dark mode works with sufficient contrast
- Responsive at 375px, 768px, 1024px
- No console errors

## Files to Create/Modify
- `worker/wrangler.toml` — Worker config with Vectorize + AI bindings
- `worker/src/index.ts` — Worker entry, API routes, CORS
- `worker/src/chunker.ts` — Markdown file → chunks with metadata
- `worker/src/ingest.ts` — One-time ingestion: chunk → embed → upload
- `worker/src/search.ts` — Query embedding + Vectorize search
- `worker/package.json` — Dependencies
- `frontend/index.html` — SPA entry point
- `frontend/app.ts` — Search UI logic, language toggle, dark mode
- `frontend/styles.css` — Design spec styles
- `CLAUDE.md` — Already created

## Open Questions
- None — ready to build.
