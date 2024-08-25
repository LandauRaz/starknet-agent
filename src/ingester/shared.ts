import { createHash } from 'crypto';
import { Document } from 'langchain/document';
import logger from '../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface BookPageDto {
  name: string;
  content: string;
}

export type BookConfig = {
  repoOwner: string;
  repoName: string;
  fileExtension: string;
  chunkSize: number;
  chunkOverlap: number;
  baseUrl: string;
};

/**
 * Interface representing a section of markdown content
 */
export interface MarkdownSection {
  title: string;
  content: string;
}

export async function processMarkdownFiles(
  config: BookConfig,
  directory: string,
): Promise<BookPageDto[]> {
  try {
    logger.info(`Processing markdown files in ${directory}`);
    const pages: BookPageDto[] = [];

    async function processDirectory(dir: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Recursively process subdirectories
          await processDirectory(fullPath);
        } else if (
          entry.isFile() &&
          path.extname(entry.name).toLowerCase() === config.fileExtension
        ) {
          // Process markdown files
          const content = await fs.readFile(fullPath, 'utf8');
          pages.push({
            name: path
              .relative(directory, fullPath)
              .replace(config.fileExtension, ''),
            content,
          });
        }
      }
    }

    await processDirectory(directory);
    return pages;
  } catch (err) {
    console.error('Error processing directory:', (err as Error).message);
    throw new Error(`Failed to process directory: ${(err as Error).message}`);
  }
}

export function isInsideCodeBlock(content: string, index: number): boolean {
  const codeBlockRegex = /```[\s\S]*?```/g;
  let match;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (index >= match.index && index < match.index + match[0].length) {
      return true;
    }
  }
  return false;
}

export function findChunksToUpdateAndRemove(
  freshChunks: Document<Record<string, any>>[],
  storedChunkHashes: { uniqueId: string; contentHash: string }[],
): {
  chunksToUpdate: Document<Record<string, any>>[];
  chunksToRemove: string[];
} {
  const storedHashesMap = new Map(
    storedChunkHashes.map((chunk) => [chunk.uniqueId, chunk.contentHash]),
  );
  const freshChunksMap = new Map(
    freshChunks.map((chunk) => [
      chunk.metadata.uniqueId,
      chunk.metadata.contentHash,
    ]),
  );

  const chunksToUpdate = freshChunks.filter((chunk) => {
    const storedHash = storedHashesMap.get(chunk.metadata.uniqueId);
    return storedHash !== chunk.metadata.contentHash;
  });

  const chunksToRemove = storedChunkHashes
    .filter((stored) => !freshChunksMap.has(stored.uniqueId))
    .map((stored) => stored.uniqueId);

  return { chunksToUpdate, chunksToRemove };
}

export function calculateHash(content: string): string {
  return createHash('md5').update(content).digest('hex');
}

//TODO: ensure this works with stuff lke https://docs.starknet.io/starknet-versions/pathfinder-versions/#0_6_6_2023_07_10_latest if required
export function createAnchor(title: string | undefined): string {
  if (!title) return '';

  return title
    .toLowerCase() // Convert to lowercase
    .replace(/[^\w\s-]/g, '') // Remove non-word characters (except spaces and hyphens)
    .replace(/\s+/g, '-') // Convert spaces to hyphens
    .replace(/-{2,}/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, ''); // Remove leading and trailing hyphens
}

export function outputTitleAndLink(
  prettyPart: string,
  anchorLink: string,
): string {
  return `[${prettyPart}]${anchorLink}  `;
}