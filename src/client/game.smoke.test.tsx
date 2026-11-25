/**
 * UI smoke test: mounts the real <App /> in jsdom (offline mode — the
 * /api/init fetch rejects, exactly like local dev) and walks the
 * start -> play flow with real DOM events. This catches wiring crashes
 * that the pure-logic tests cannot; it does not verify canvas pixels.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App } from './App';

vi.mock('@devvit/web/client', () => ({
  context: {},
  requestExpandedMode: vi.fn(),
  navigateTo: vi.fn(),
  showShareSheet: vi.fn().mockResolvedValue(undefined),
  showToast: vi.fn(),
}));

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function findButton(container: HTMLElement, text: string): HTMLButtonElement {
  const buttons = [...container.querySelectorAll('button')];
  const found = buttons.find((b) => b.textContent?.includes(text));
  if (!found) throw new Error(`Button "${text}" not found`);
  return found;
}

describe('App smoke test (offline mode)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders the start screen, enters the dungeon, and plays moves', async () => {
    root = createRoot(container);
    await act(async () => {
      root?.render(<App />);
    });
    await flush();

    // Start screen (offline practice mode).
    expect(container.textContent).toContain('ONE RUN');
    expect(container.textContent).toContain('Enter the dungeon');
    expect(container.textContent).toContain('Practice mode');

    // Enter the dungeon.
    await act(async () => {
      findButton(container, 'Enter the dungeon').click();
    });
    await flush();

    const canvas = container.querySelector('canvas[aria-label="One Run dungeon board"]');
    expect(canvas).not.toBeNull();
    expect(container.textContent).toContain('SCORE');
    expect(container.textContent).toContain('Lantern Blast');

    // Move with the keyboard (a few steps in different directions).
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
      await act(async () => {
        window.dispatchEvent(new window.KeyboardEvent('keydown', { key }));
      });
    }
    await flush();
    expect(container.querySelector('canvas')).not.toBeNull();
    expect(container.textContent).toContain('SCORE');

    // Fire the Lantern Blast via its button.
    await act(async () => {
      findButton(container, 'Lantern Blast').click();
    });
    await flush();
    expect(container.querySelector('canvas')).not.toBeNull();

    // Wait a turn via the D-pad.
    await act(async () => {
      findButton(container, 'WAIT').click();
    });
    await flush();
    expect(container.querySelector('canvas')).not.toBeNull();
  });
});
