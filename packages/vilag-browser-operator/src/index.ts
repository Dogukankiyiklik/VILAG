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

export type SearchEngine = 'google' | 'bing' | 'baidu';

export interface BrowserOperatorOptions {
  headless?: boolean;
  searchEngine?: SearchEngine;
  startUrl?: string;
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
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: this.options.headless ?? false,
        args: ['--disable-blink-features=AutomationControlled'],
      });
      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
      this.currentPage = await this.context.newPage();

      // Navigate to search engine or start URL
      const startUrl = this.options.startUrl || this.getSearchEngineUrl();
      await this.currentPage.goto(startUrl, { waitUntil: 'domcontentloaded' }).catch(() => { });
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
    switch (this.options.searchEngine) {
      case 'bing': return 'https://www.bing.com';
      case 'baidu': return 'https://www.baidu.com';
      default: return 'https://www.google.com';
    }
  }

  /**
   * Take a screenshot of the current page.
   */
  async screenshot(): Promise<ScreenshotOutput> {
    const page = await this.getActivePage();
    const buffer = await page.screenshot({ type: 'jpeg', quality: 75 });
    const base64 = buffer.toString('base64');

    const viewport = page.viewportSize() || { width: 1280, height: 720 };
    const scaleFactor = await this.getDeviceScaleFactor();

    return {
      base64,
      scaleFactor,
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

    // Resolve coordinates from model space to screen space
    const resolveCoords = (input: any): { x: number; y: number } => {
      if (!input) return { x: 0, y: 0 };
      const raw = input.start_box || input.point || input.start_point || input;
      const x = typeof raw.x === 'number' ? raw.x : 0;
      const y = typeof raw.y === 'number' ? raw.y : 0;
      // Scale from model coordinate space to viewport
      const viewport = page.viewportSize() || { width: 1280, height: 720 };
      return {
        x: Math.round((x / factors[0]) * viewport.width),
        y: Math.round((y / factors[1]) * viewport.height),
      };
    };

    switch (action_type) {
      case 'click': {
        const coords = resolveCoords(action_inputs);
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
        const startCoords = resolveCoords(action_inputs);
        const endRaw = action_inputs.end_box || action_inputs.end_point || { x: 0, y: 0 };
        const viewport = page.viewportSize() || { width: 1280, height: 720 };
        const endCoords = {
          x: Math.round((endRaw.x / factors[0]) * viewport.width),
          y: Math.round((endRaw.y / factors[1]) * viewport.height),
        };
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
    startUrl?: string,
  ): Promise<DefaultBrowserOperator> {
    if (!DefaultBrowserOperator.instance) {
      DefaultBrowserOperator.instance = new DefaultBrowserOperator({
        headless: false,
        searchEngine,
        startUrl,
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
