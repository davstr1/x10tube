// x10 CRUD operations
import { nanoid } from 'nanoid';
import db, { X10, Video } from '../db.js';
import { extractVideoInfo, estimateTokens, VideoInfo } from './transcript.js';

export interface X10WithVideos extends X10 {
  videos: Video[];
  tokenCount: number;
}

// Generate a short unique ID
function generateId(): string {
  return nanoid(8);
}

// Create a new x10 with videos
export async function createX10(
  urls: string[],
  userId: string | null = null,
  title: string | null = null,
  anonymousId: string | null = null
): Promise<{ x10: X10WithVideos; failed: { url: string; error: string }[] }> {
  const x10Id = generateId();
  const now = new Date().toISOString();

  // Insert x10
  db.prepare(`
    INSERT INTO x10s (id, user_id, anonymous_id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(x10Id, userId, anonymousId, title, now, now);

  // Extract and insert videos
  const failed: { url: string; error: string }[] = [];
  const videos: Video[] = [];

  for (const url of urls) {
    try {
      const info = await extractVideoInfo(url);
      const videoId = generateId();

      db.prepare(`
        INSERT INTO videos (id, x10_id, url, youtube_id, title, channel, duration, transcript, added_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(videoId, x10Id, info.url, info.youtubeId, info.title, info.channel, info.duration, info.transcript, now);

      videos.push({
        id: videoId,
        x10_id: x10Id,
        url: info.url,
        youtube_id: info.youtubeId,
        title: info.title,
        channel: info.channel,
        duration: info.duration,
        transcript: info.transcript,
        added_at: now
      });
    } catch (error) {
      failed.push({
        url,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Calculate token count
  const tokenCount = videos.reduce((sum, v) => sum + estimateTokens(v.transcript || ''), 0);

  // Use first video's title as default if no title provided
  const effectiveTitle = title || (videos.length > 0 ? videos[0].title : null);
  if (effectiveTitle && effectiveTitle !== title) {
    db.prepare('UPDATE x10s SET title = ? WHERE id = ?').run(effectiveTitle, x10Id);
  }

  const x10: X10WithVideos = {
    id: x10Id,
    user_id: userId,
    anonymous_id: anonymousId,
    title: effectiveTitle,
    pre_prompt: null,
    created_at: now,
    updated_at: now,
    videos,
    tokenCount
  };

  return { x10, failed };
}

// Get x10 by ID with videos
export function getX10ById(id: string): X10WithVideos | null {
  const x10 = db.prepare('SELECT * FROM x10s WHERE id = ?').get(id) as X10 | undefined;

  if (!x10) return null;

  const videos = db.prepare('SELECT * FROM videos WHERE x10_id = ? ORDER BY added_at ASC').all(id) as Video[];
  const tokenCount = videos.reduce((sum, v) => sum + estimateTokens(v.transcript || ''), 0);

  return { ...x10, videos, tokenCount };
}

// Get all x10s for a user
export function getX10sForUser(userId: string): X10WithVideos[] {
  const x10s = db.prepare('SELECT * FROM x10s WHERE user_id = ? ORDER BY updated_at DESC').all(userId) as X10[];

  return x10s.map(x10 => {
    const videos = db.prepare('SELECT * FROM videos WHERE x10_id = ? ORDER BY added_at ASC').all(x10.id) as Video[];
    const tokenCount = videos.reduce((sum, v) => sum + estimateTokens(v.transcript || ''), 0);
    return { ...x10, videos, tokenCount };
  });
}

// Get all x10s for an anonymous user (by cookie ID)
export function getX10sForAnonymous(anonymousId: string): X10WithVideos[] {
  const x10s = db.prepare('SELECT * FROM x10s WHERE anonymous_id = ? ORDER BY updated_at DESC').all(anonymousId) as X10[];

  return x10s.map(x10 => {
    const videos = db.prepare('SELECT * FROM videos WHERE x10_id = ? ORDER BY added_at ASC').all(x10.id) as Video[];
    const tokenCount = videos.reduce((sum, v) => sum + estimateTokens(v.transcript || ''), 0);
    return { ...x10, videos, tokenCount };
  });
}

// Add video to existing x10
export async function addVideoToX10(x10Id: string, url: string): Promise<Video> {
  const info = await extractVideoInfo(url);
  const videoId = generateId();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO videos (id, x10_id, url, youtube_id, title, channel, duration, transcript, added_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(videoId, x10Id, info.url, info.youtubeId, info.title, info.channel, info.duration, info.transcript, now);

  // Update x10 updated_at
  db.prepare('UPDATE x10s SET updated_at = ? WHERE id = ?').run(now, x10Id);

  return {
    id: videoId,
    x10_id: x10Id,
    url: info.url,
    youtube_id: info.youtubeId,
    title: info.title,
    channel: info.channel,
    duration: info.duration,
    transcript: info.transcript,
    added_at: now
  };
}

// Remove video from x10
export function removeVideoFromX10(x10Id: string, videoId: string): boolean {
  const result = db.prepare('DELETE FROM videos WHERE id = ? AND x10_id = ?').run(videoId, x10Id);

  if (result.changes > 0) {
    db.prepare('UPDATE x10s SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), x10Id);
    return true;
  }

  return false;
}

// Update x10 title
export function updateX10Title(id: string, title: string): boolean {
  const result = db.prepare('UPDATE x10s SET title = ?, updated_at = ? WHERE id = ?')
    .run(title, new Date().toISOString(), id);
  return result.changes > 0;
}

// Update x10 pre-prompt
export function updateX10PrePrompt(id: string, prePrompt: string | null): boolean {
  const result = db.prepare('UPDATE x10s SET pre_prompt = ?, updated_at = ? WHERE id = ?')
    .run(prePrompt, new Date().toISOString(), id);
  return result.changes > 0;
}

// Claim orphan x10 (set user_id)
export function claimX10(id: string, userId: string): boolean {
  const result = db.prepare('UPDATE x10s SET user_id = ?, updated_at = ? WHERE id = ? AND user_id IS NULL')
    .run(userId, new Date().toISOString(), id);
  return result.changes > 0;
}

// Fork x10 (create a copy for another user)
export function forkX10(originalId: string, newUserId: string): X10WithVideos | null {
  const original = getX10ById(originalId);
  if (!original) return null;

  const newId = generateId();
  const now = new Date().toISOString();

  // Copy x10
  db.prepare(`
    INSERT INTO x10s (id, user_id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(newId, newUserId, original.title, now, now);

  // Copy videos
  for (const video of original.videos) {
    const videoId = generateId();
    db.prepare(`
      INSERT INTO videos (id, x10_id, url, youtube_id, title, channel, duration, transcript, added_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(videoId, newId, video.url, video.youtube_id, video.title, video.channel, video.duration, video.transcript, now);
  }

  return getX10ById(newId);
}

// Delete x10
export function deleteX10(id: string): boolean {
  const result = db.prepare('DELETE FROM x10s WHERE id = ?').run(id);
  return result.changes > 0;
}

// Check if video URL is already in a user's x10s
export function checkVideoInUserX10s(userId: string, youtubeId: string): string[] {
  const results = db.prepare(`
    SELECT x10s.id FROM x10s
    JOIN videos ON videos.x10_id = x10s.id
    WHERE x10s.user_id = ? AND videos.youtube_id = ?
  `).all(userId, youtubeId) as { id: string }[];

  return results.map(r => r.id);
}

// Check if video URL is already in an anonymous user's x10s
export function checkVideoInAnonymousX10s(anonymousId: string, youtubeId: string): string[] {
  const results = db.prepare(`
    SELECT x10s.id FROM x10s
    JOIN videos ON videos.x10_id = x10s.id
    WHERE x10s.anonymous_id = ? AND videos.youtube_id = ?
  `).all(anonymousId, youtubeId) as { id: string }[];

  return results.map(r => r.id);
}
