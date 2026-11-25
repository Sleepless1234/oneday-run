/**
 * Thin wrappers around Devvit client effects that degrade gracefully
 * outside the Reddit webview (local dev / offline practice mode).
 */
import { navigateTo, showShareSheet, showToast } from '@devvit/web/client';

export function safeToast(text: string): void {
  try {
    showToast(text);
  } catch {
    // Outside the Reddit webview there is no toast surface.
  }
}

export async function safeShare(text: string): Promise<void> {
  try {
    await showShareSheet({ text, title: 'One Run' });
    return;
  } catch {
    // Fall through to the clipboard.
  }
  try {
    await navigator.clipboard.writeText(text);
    safeToast('Result copied to clipboard');
  } catch {
    safeToast('Could not share this result');
  }
}

export function safeNavigateTo(url: string): void {
  try {
    navigateTo(url);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}
