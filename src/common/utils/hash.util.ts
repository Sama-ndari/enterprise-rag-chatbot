import * as crypto from 'crypto';

/**
 * Computes a SHA256 hash for the given content.
 * @param content - The string content to hash.
 * @returns The hex-encoded SHA256 hash.
 */
export function createContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}
