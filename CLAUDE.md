# AI Bible Study Assistant

Bilingual (EN/ZH) RAG-powered Bible commentary search across 25 series (567 files, 355 MB). Deployed on Cloudflare.

## Tech Stack
- **Frontend:** HTML/TypeScript SPA on Cloudflare Pages
- **Backend:** Cloudflare Workers (API + RAG logic)
- **Embeddings:** Cloudflare Workers AI (`@cf/baai/bge-base-en-v1.5`)
- **Vector Store:** Cloudflare Vectorize
- **UI translations:** Bilingual EN/ZH (commentary content stays English)

## Structure
```
AI-Bible-Study-Assistant/
├── vault/                  # 567 markdown files (source commentaries, do NOT modify)
├── worker/                 # Cloudflare Worker (API, embedding, search)
│   ├── src/
│   │   ├── index.ts        # Worker entry point + API routes
│   │   ├── chunker.ts      # Markdown → chunks with metadata
│   │   ├── ingest.ts       # One-time script: chunk + embed + upload to Vectorize
│   │   └── search.ts       # Query logic: embed query → Vectorize → format results
│   └── wrangler.toml
├── frontend/               # Cloudflare Pages (static SPA)
│   ├── index.html
│   ├── app.ts
│   └── styles.css
├── extract.py              # PDF→markdown extraction script (already done)
└── CLAUDE.md
```

## Entry Points
- Frontend: `frontend/index.html`
- Worker API: `worker/src/index.ts`

## Deployment
- Worker: `cd worker && wrangler deploy`
- Pages: `wrangler pages deploy frontend/`
- Vectorize index must be created before first ingest: `wrangler vectorize create bible-commentaries --dimensions=768 --metric=cosine`

## Conventions
- All user-facing strings bilingual (EN/ZH toggle)
- Chunk metadata must include: series name, book, testament (OT/NT), source filename
- Search results grouped by commentary series
- No authentication required
