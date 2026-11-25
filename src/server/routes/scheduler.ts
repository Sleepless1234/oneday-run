/**
 * Scheduler endpoints — invoked by Devvit's scheduler (see devvit.json).
 * The daily-post task runs at 00:05 UTC and creates the day's game post.
 * The request body carries the task metadata; the handler only needs the
 * current date, which is derived server-side.
 */
import { Hono } from 'hono';
import { createPost } from '../core/post';

export const scheduler = new Hono();

scheduler.post('/daily-post', async (c) => {
  try {
    const post = await createPost();
    return c.json({ status: 'success', postId: post.id }, 200);
  } catch (error) {
    console.error(`Error creating daily post: ${error}`);
    return c.json(
      { status: 'error', message: 'Failed to create daily post' },
      500
    );
  }
});
