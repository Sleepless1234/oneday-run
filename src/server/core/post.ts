/**
 * Creates the daily One Run post. The title carries the day number and
 * today's twist so the feed itself teases the game.
 */
import { reddit } from '@devvit/web/server';
import { modifierForDay } from '../../shared/modifiers';
import { dayNumber, todayKey } from '../../shared/seed';

export const createPost = async () => {
  const date = todayKey();
  const modifier = modifierForDay(date);
  return await reddit.submitCustomPost({
    title: `One Run — Day ${dayNumber(date)}: ${modifier.name} — one dungeon, one life, one run`,
  });
};
