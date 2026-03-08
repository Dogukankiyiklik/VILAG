/**
 * VILAG - Browser Operator
 * 
 * Playwright-based browser operator that implements the Operator interface.
 * Handles screenshot, click, type, scroll, hotkey, navigate, drag.
 */
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { StatusEnum } from '@vilag/shared/types';
import { sleep } from '@vilag/shared/utils';
import type { Operator, ExecuteParams, ExecuteOutput, ScreenshotOutput } from '@vilag/sdk/core';

import * as path from 'path';

export type SearchEngine = 'google';

export interface BrowserOperatorOptions {
  headless?: boolean;
  searchEngine?: SearchEngine;
  startUrl?: string;
  highlightElements?: boolean;
  usePersistentProfile?: boolean;
  profileDir?: string;
}

export class BrowserOperator implements Operator {
  static MANUAL = {
    ACTION_SPACES: [
      `click(start_box='<|box_start|>(x1,y1)<|box_end|>')`,
      `left_double(start_box='<|box_start|>(x1,y1)<|box_end|>')`,
      `right_single(start_box='<|box_start|>(x1,y1)<|box_end|>')`,
      `drag(start_box='<|box_start|>(x1,y1)<|box_end|>', end_box='<|box_start|>(x3,y3)<|box_end|>')`,
      `hotkey(key='ctrl c')`,
      `type(content='xxx')`,
      `scroll(start_box='<|box_start|>(x1,y1)<|box_end|>', direction='down or up or right or left')`,
      `navigate(content='xxx')`,
      `navigate_back()`,
      `wait()`,
      `finished()`,
      `call_user()`,
    ],
  };

  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private currentPage: Page | null = null;

  constructor(private options: BrowserOperatorOptions = {}) { }

  /**
   * Launch browser if not already running, return active page.
   */
  async getActivePage(): Promise<Page> {
    if (!this.context) {
      if (this.options.usePersistentProfile && this.options.profileDir) {
        // Use persistent context (saves cookies, local storage, logins)
        const absoluteProfileDir = path.resolve(process.cwd(), this.options.profileDir);
        this.context = await chromium.launchPersistentContext(absoluteProfileDir, {
          headless: this.options.headless ?? false,
          args: ['--disable-blink-features=AutomationControlled'],
          viewport: { width: 1280, height: 720 },
        });

        // LaunchPersistentContext directly gives us a context and a default page
        const pages = this.context.pages();
        this.currentPage = pages.length > 0 ? pages[0] : await this.context.newPage();
      } else {
        // Fallback to classic incognito/clean session
        if (!this.browser) {
          this.browser = await chromium.launch({
            headless: this.options.headless ?? false,
            args: ['--disable-blink-features=AutomationControlled'],
          });
        }
        this.context = await this.browser.newContext({
          viewport: { width: 1280, height: 720 },
        });
        this.currentPage = await this.context.newPage();
      }

      // Navigate to search engine or start URL
      const startUrl = this.options.startUrl || this.getSearchEngineUrl();
      await this.currentPage.goto(startUrl, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => { });
      await sleep(5000); // ⬇️ DEĞİŞİKLİK: Teams'in tamamen yüklenmesi için 5 sn ekstra bekle
    }

    // Get the most recent page
    if (this.context) {
      const pages = this.context.pages();
      if (pages.length > 0) {
        this.currentPage = pages[pages.length - 1];
      }
    }

    if (!this.currentPage || this.currentPage.isClosed()) {
      throw new Error('No active page found');
    }

    return this.currentPage;
  }

  private getSearchEngineUrl(): string {
    return 'https://www.google.com';
  }

  /**
   * Inject baseline CSS for highlighting clickable elements
   */
  private async injectHighlightStyles(page: Page) {
    await page.evaluate(() => {
      const styleId = 'vilag-highlight-styles';
      if (document.getElementById(styleId)) return;

      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .vilag-clickable-highlight {
          outline: 3px solid rgba(0, 155, 255, 0.7) !important;
          box-shadow: 0 0 0 3px rgba(0, 155, 255, 0.3) !important;
          background-color: rgba(0, 155, 255, 0.05) !important;
          transition: all 0.2s ease-in-out !important;
          z-index: 999 !important;
          position: relative !important;
        }
        .vilag-clickable-highlight.vilag-highlight-button {
          outline: 3px solid rgba(255, 64, 129, 0.8) !important;
          box-shadow: 0 0 0 3px rgba(255, 64, 129, 0.3) !important;
          background-color: rgba(255, 64, 129, 0.05) !important;
        }
        .vilag-clickable-highlight.vilag-highlight-link {
          outline: 3px solid rgba(124, 77, 255, 0.8) !important;
          box-shadow: 0 0 0 3px rgba(124, 77, 255, 0.3) !important;
          background-color: rgba(124, 77, 255, 0.05) !important;
        }
        .vilag-clickable-highlight.vilag-highlight-input {
          outline: 3px solid rgba(0, 230, 118, 0.8) !important;
          box-shadow: 0 0 0 3px rgba(0, 230, 118, 0.3) !important;
          background-color: rgba(0, 230, 118, 0.05) !important;
        }
        .vilag-clickable-highlight.vilag-highlight-other {
          outline: 3px solid rgba(255, 171, 0, 0.8) !important;
          box-shadow: 0 0 0 3px rgba(255, 171, 0, 0.3) !important;
          background-color: rgba(255, 171, 0, 0.05) !important;
        }
      `;
      document.head.appendChild(style);
    });
  }

  /**
   * Find and highlight all interactive elements on the page (SoM logic)
   */
  private async addClickableHighlights(page: Page) {
    await this.injectHighlightStyles(page);
    await page.evaluate(() => {
      const highlightElements = (selectors: string[], typeClass: string) => {
        const selector = selectors.join(', ');
        const elements = Array.from(document.querySelectorAll(selector));

        const visibleElements = elements.filter((el) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          const isVisible = rect.width > 0 && rect.height > 0 &&
            style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';

          let current = el as HTMLElement;
          let hasPointerEvents = true;
          while (current && current !== document.body) {
            if (window.getComputedStyle(current).pointerEvents === 'none') {
              hasPointerEvents = false;
              break;
            }
            current = current.parentElement as HTMLElement;
          }

          const isDisabled = (el as HTMLElement).hasAttribute('disabled') ||
            (el as HTMLElement).getAttribute('aria-disabled') === 'true';

          return isVisible && hasPointerEvents && !isDisabled;
        });

        visibleElements.forEach((el) => {
          el.classList.add('vilag-clickable-highlight');
          el.classList.add(typeClass);
        });
      };

      highlightElements(['button', '[role="button"]', '.btn', '.button', '[type="button"]', '[type="submit"]', '[type="reset"]'], 'vilag-highlight-button');
      highlightElements(['a', '[role="link"]', '.nav-item'], 'vilag-highlight-link');
      highlightElements(['input', 'select', 'textarea', '[role="checkbox"]', '[role="radio"]', '[role="textbox"]', '[contenteditable="true"]'], 'vilag-highlight-input');
      highlightElements(['[role="tab"]', '[role="menuitem"]', '[role="option"]', '[onclick]', '[tabindex="0"]', 'summary', 'details'], 'vilag-highlight-other');
    });
  }

  /**
   * Remove highlighting from the page
   */
  private async removeClickableHighlights(page: Page) {
    await page.evaluate(() => {
      const highlightedElements = document.querySelectorAll('.vilag-clickable-highlight');
      highlightedElements.forEach((el) => {
        el.classList.remove('vilag-clickable-highlight');
        el.classList.remove('vilag-highlight-button');
        el.classList.remove('vilag-highlight-link');
        el.classList.remove('vilag-highlight-input');
        el.classList.remove('vilag-highlight-other');
      });
    });
  }

  /**
   * Take a screenshot of the current page.
   */
  async screenshot(): Promise<ScreenshotOutput> {
    const page = await this.getActivePage();
    const shouldHighlight = this.options.highlightElements !== false;

    if (shouldHighlight) {
      await this.addClickableHighlights(page);
      await sleep(300); // Wait for styles to settle
    }

    let buffer;
    try {
      buffer = await page.screenshot({ type: 'jpeg', quality: 75 });
    } finally {
      if (shouldHighlight) {
        await this.removeClickableHighlights(page);
      }
    }

    const base64 = buffer.toString('base64');
    const scaleFactor = await this.getDeviceScaleFactor();
    const viewport = page.viewportSize();

    return {
      base64,
      scaleFactor,
      width: viewport?.width || 1280,
      height: viewport?.height || 720,
    };
  }

  /**
   * Execute an action parsed from the model output.
   */
  async execute(params: ExecuteParams): Promise<ExecuteOutput> {
    const { parsedPrediction, screenWidth, screenHeight, scaleFactor, factors } = params;
    const { action_type, action_inputs } = parsedPrediction;

    const page = await this.getActivePage();
    if (!page) {
      throw new Error('No active page found to execute action');
    }

    // Resolve coordinates from model output to screen pixels.
    // Fallback manual factor-based scaling
    const resolveCoords = (input: any): { x: number; y: number } => {
      if (!input) return { x: 0, y: 0 };
      const raw = input.start_box || input.point || input.start_point || input;
      const x = typeof raw.x === 'number' ? raw.x : 0;
      const y = typeof raw.y === 'number' ? raw.y : 0;
      const viewport = page.viewportSize() || { width: 1280, height: 720 };
      return {
        x: Math.round((x / factors[0]) * viewport.width),
        y: Math.round((y / factors[1]) * viewport.height),
      };
    };

    switch (action_type) {
      case 'click': {
        const coords = resolveCoords(action_inputs);
        const viewport = page.viewportSize() || { width: 1280, height: 720 };
        console.log(`[DEBUG] CLICK at pixel: x=${coords.x}, y=${coords.y} | viewport: width=${viewport.width}, height=${viewport.height}`);
        await page.mouse.click(coords.x, coords.y);
        await this.waitForPageSettle(page);
        break;
      }
      case 'left_double': {
        const coords = resolveCoords(action_inputs);
        await page.mouse.dblclick(coords.x, coords.y);
        await this.waitForPageSettle(page);
        break;
      }
      case 'right_single': {
        const coords = resolveCoords(action_inputs);
        await page.mouse.click(coords.x, coords.y, { button: 'right' });
        await this.waitForPageSettle(page);
        break;
      }
      case 'type': {
        const content = action_inputs.content || '';
        // Check if content ends with \n (submit)
        const shouldSubmit = content.endsWith('\n');
        const text = shouldSubmit ? content.slice(0, -1) : content;
        if (text) {
          await page.keyboard.type(text, { delay: 30 });
        }
        if (shouldSubmit) {
          await page.keyboard.press('Enter');
        }
        await this.waitForPageSettle(page);
        break;
      }
      case 'hotkey': {
        const key = action_inputs.key || '';
        const keys = key.split(' ').map((k: string) => this.mapKey(k));
        if (keys.length === 1) {
          await page.keyboard.press(keys[0]);
        } else {
          // Hold modifier keys
          for (let i = 0; i < keys.length - 1; i++) {
            await page.keyboard.down(keys[i]);
          }
          await page.keyboard.press(keys[keys.length - 1]);
          for (let i = keys.length - 2; i >= 0; i--) {
            await page.keyboard.up(keys[i]);
          }
        }
        await this.waitForPageSettle(page);
        break;
      }
      case 'scroll': {
        const coords = resolveCoords(action_inputs);
        const direction = action_inputs.direction || 'down';
        const deltaX = direction === 'right' ? 300 : direction === 'left' ? -300 : 0;
        const deltaY = direction === 'down' ? 300 : direction === 'up' ? -300 : 0;
        await page.mouse.move(coords.x, coords.y);
        await page.mouse.wheel(deltaX, deltaY);
        await sleep(500);
        break;
      }
      case 'navigate': {
        const url = action_inputs.content || '';
        if (url) {
          await page.goto(url.startsWith('http') ? url : `https://${url}`, {
            waitUntil: 'domcontentloaded',
            timeout: 15000,
          }).catch(() => { });
        }
        break;
      }
      case 'navigate_back': {
        await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => { });
        break;
      }
      case 'drag': {
        const startCoords = resolveCoords(action_inputs.start_box || action_inputs);
        const endCoords = resolveCoords(action_inputs.end_box || action_inputs);
        await page.mouse.move(startCoords.x, startCoords.y);
        await page.mouse.down();
        await page.mouse.move(endCoords.x, endCoords.y, { steps: 10 });
        await page.mouse.up();
        await this.waitForPageSettle(page);
        break;
      }
      case 'wait': {
        await sleep(5000);
        break;
      }
      case 'finished':
      case 'call_user':
        // Handled by GUIAgent
        break;
      default:
        console.warn(`[BrowserOperator] Unknown action: ${action_type}`);
    }

    return { status: StatusEnum.RUNNING };
  }

  private mapKey(key: string): string {
    const keyMap: Record<string, string> = {
      ctrl: 'Control',
      alt: 'Alt',
      shift: 'Shift',
      meta: 'Meta',
      enter: 'Enter',
      tab: 'Tab',
      space: 'Space',
      backspace: 'Backspace',
      delete: 'Delete',
      escape: 'Escape',
      up: 'ArrowUp',
      down: 'ArrowDown',
      left: 'ArrowLeft',
      right: 'ArrowRight',
      home: 'Home',
      end: 'End',
      pageup: 'PageUp',
      pagedown: 'PageDown',
    };
    return keyMap[key.toLowerCase()] || key;
  }

  private async getDeviceScaleFactor(): Promise<number> {
    const page = await this.getActivePage();
    return await page.evaluate(() => window.devicePixelRatio) || 1;
  }

  private async waitForPageSettle(page: Page): Promise<void> {
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => { });
      await sleep(300);
    } catch {
      // Ignore settlement errors
    }
  }

  /**
   * Cleanup - close browser
   */
  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => { });
      this.browser = null;
      this.context = null;
      this.currentPage = null;
    }
  }
}

/**
 * Singleton browser operator for the desktop app.
 */
export class DefaultBrowserOperator extends BrowserOperator {
  private static instance: DefaultBrowserOperator | null = null;

  static async getInstance(
    searchEngine: SearchEngine = 'google',
    // ⬇️ DEĞİŞİKLİK 1: Ajanın DİREKT olarak hangi siteye gideceğini buraya yazabilirsiniz.
    // Örnek: startUrl: string = 'https://teams.microsoft.com/v2/',
    startUrl: string = 'https://www.google.com/',

    // ⬇️ DEĞİŞİKLİK 2: Oturum çerezini (Giriş bilgilerini) saklamak için burayı 'true' yapın.
    // Örnek: usePersistentProfile: boolean = true,
    usePersistentProfile: boolean = true,

    // ⬇️ DEĞİŞİKLİK 3: Çerezlerin kaydedileceği klasörün ismini buraya yazın.
    // Örnek: profileDir: string = '.benim_oturumlarim'
    profileDir: string = '.vilag_browser_profile'
  ): Promise<DefaultBrowserOperator> {
    if (!DefaultBrowserOperator.instance) {
      DefaultBrowserOperator.instance = new DefaultBrowserOperator({
        headless: false,
        searchEngine,
        startUrl, // If undefined, getActivePage() falls back to Google
        highlightElements: false,
        usePersistentProfile,
        profileDir,
      });
    }
    return DefaultBrowserOperator.instance;
  }

  static async destroyInstance(): Promise<void> {
    if (DefaultBrowserOperator.instance) {
      await DefaultBrowserOperator.instance.cleanup();
      DefaultBrowserOperator.instance = null;
    }
  }
}
