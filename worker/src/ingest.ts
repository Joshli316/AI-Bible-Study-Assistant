import * as fs from 'fs';
import * as path from 'path';
import { chunkFile, Chunk } from './chunker.js';

const VAULT_ROOT = path.resolve(__dirname, '../../vault');
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const INDEX_NAME = 'bible-commentaries';
const EMBED_MODEL = '@cf/baai/bge-base-en-v1.5';
const EMBED_BATCH_SIZE = 50;  // Workers AI batch limit
const VECTORIZE_BATCH_SIZE = 100;

if (!ACCOUNT_ID || !API_TOKEN) {
  console.error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN env vars');
  process.exit(1);
}

function findMarkdownFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findMarkdownFiles(fullPath));
    } else if (entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${EMBED_MODEL}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: texts }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Embedding failed (${res.status}): ${body}`);
  }
  const json = await res.json() as any;
  return json.result.data;
}

async function uploadToVectorize(vectors: { id: string; values: number[]; metadata: Record<string, string | number> }[]): Promise<void> {
  // Vectorize v2 insert uses NDJSON format
  const ndjson = vectors.map(v => JSON.stringify(v)).join('\n');
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/vectorize/v2/indexes/${INDEX_NAME}/insert`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/x-ndjson',
      },
      body: ndjson,
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vectorize upload failed (${res.status}): ${body}`);
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log(`Scanning vault at: ${VAULT_ROOT}`);
  const files = findMarkdownFiles(VAULT_ROOT);
  console.log(`Found ${files.length} markdown files\n`);

  let totalChunks = 0;
  let totalVectors = 0;
  let filesProcessed = 0;
  let errors = 0;

  // Chunk all files first
  console.log('=== Phase 1: Chunking files ===');
  const allChunks: Chunk[] = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const chunks = chunkFile(content, file, VAULT_ROOT);
      allChunks.push(...chunks);
      filesProcessed++;
      if (filesProcessed % 50 === 0 || filesProcessed === files.length) {
        console.log(`  Chunked ${filesProcessed}/${files.length} files (${allChunks.length} chunks so far)`);
      }
    } catch (err) {
      console.error(`  Error chunking ${path.basename(file)}: ${err}`);
      errors++;
    }
  }

  console.log(`\nChunking complete: ${allChunks.length} chunks from ${filesProcessed} files\n`);

  // Embed and upload in batches
  console.log('=== Phase 2: Embedding + uploading ===');
  const pendingVectors: { id: string; values: number[]; metadata: Record<string, string | number> }[] = [];

  for (let i = 0; i < allChunks.length; i += EMBED_BATCH_SIZE) {
    const batch = allChunks.slice(i, i + EMBED_BATCH_SIZE);
    const texts = batch.map(c => c.text.slice(0, 512)); // bge-base has 512 token limit, truncate long texts

    try {
      const embeddings = await embedTexts(texts);

      for (let j = 0; j < batch.length; j++) {
        pendingVectors.push({
          id: batch[j].id,
          values: embeddings[j],
          metadata: {
            series: batch[j].metadata.series,
            testament: batch[j].metadata.testament,
            book: batch[j].metadata.book,
            filename: batch[j].metadata.filename,
            pageNumber: batch[j].metadata.pageNumber,
            chunkIndex: batch[j].metadata.chunkIndex,
            text: batch[j].text.slice(0, 1000), // store truncated text in metadata for retrieval
          },
        });
      }

      // Upload to Vectorize when we have enough
      while (pendingVectors.length >= VECTORIZE_BATCH_SIZE) {
        const uploadBatch = pendingVectors.splice(0, VECTORIZE_BATCH_SIZE);
        await uploadToVectorize(uploadBatch);
        totalVectors += uploadBatch.length;
      }

      totalChunks += batch.length;
      if ((i + EMBED_BATCH_SIZE) % 500 < EMBED_BATCH_SIZE || i + EMBED_BATCH_SIZE >= allChunks.length) {
        const pct = Math.round(((i + batch.length) / allChunks.length) * 100);
        console.log(`  Progress: ${i + batch.length}/${allChunks.length} chunks embedded (${pct}%), ${totalVectors} vectors uploaded`);
      }

      // Rate limit: small delay between embedding calls
      await sleep(100);
    } catch (err) {
      console.error(`  Error at batch ${i}: ${err}`);
      errors++;
      await sleep(1000); // back off on error
    }
  }

  // Upload remaining vectors
  if (pendingVectors.length > 0) {
    try {
      await uploadToVectorize(pendingVectors);
      totalVectors += pendingVectors.length;
    } catch (err) {
      console.error(`  Error uploading final batch: ${err}`);
      errors++;
    }
  }

  console.log('\n=== Ingestion Complete ===');
  console.log(`  Files processed: ${filesProcessed}`);
  console.log(`  Total chunks: ${totalChunks}`);
  console.log(`  Vectors uploaded: ${totalVectors}`);
  console.log(`  Errors: ${errors}`);
}

main().catch(console.error);
