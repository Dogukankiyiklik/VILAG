/**
 * VILAG - Desktop Operator (NutJS-based)
 *
 * Full desktop mouse/keyboard control with high-quality screenshots.
 * This adapts the UI-TARS NutJS operator to the VILAG SDK Operator interface.
 */
import type {
  ExecuteParams,
  ExecuteOutput,
  ScreenshotOutput,
} from '@vilag/sdk/core';
import { Operator } from '@vilag/sdk/core';
import { StatusEnum } from '@vilag/shared/types';
import { Jimp } from 'jimp';
import {
  screen,
  Button,
  Key,
  Point,
  mouse,
  keyboard,
  sleep,
  straightTo,
  clipboard,
} from '@computer-use/nut-js';

/**
 * Move the mouse in a straight line to the target point (if provided).
 */
const moveStraightTo = async (
  x: number | null,
  y: number | null,
): Promise<void> => {
  if (x === null || y === null) return;
  await mouse.move(straightTo(new Point(x, y)));
};

/**
 * Parse a model box string like "[x1, y1, x2, y2]" into a screen coordinate.
 * We use the top-left corner as the click/anchor point.
 */
const parseBoxToScreenCoords = (params: {
  boxStr: string;
  screenWidth: number;
  screenHeight: number;
}): { x: number | null; y: number | null } => {
  const { boxStr, screenWidth, screenHeight } = params;
  if (!boxStr) return { x: null, y: null };

  try {
    const cleaned = boxStr.replace(/[\[\]\s]/g, '');
    const parts = cleaned.split(',');
    if (parts.length < 2) return { x: null, y: null };

    const xNorm = Number(parts[0]);
    const yNorm = Number(parts[1]);
    if (Number.isNaN(xNorm) || Number.isNaN(yNorm)) {
      return { x: null, y: null };
    }

    const x = Math.round(xNorm * screenWidth);
    const y = Math.round(yNorm * screenHeight);
    return { x, y };
  } catch {
    return { x: null, y: null };
  }
};

export class NutJSOperator extends Operator {
  static MANUAL = {
    ACTION_SPACES: [
      `click(start_box='[x1, y1, x2, y2]')`,
      `left_double(start_box='[x1, y1, x2, y2]')`,
      `right_single(start_box='[x1, y1, x2, y2]')`,
      `drag(start_box='[x1, y1, x2, y2]', end_box='[x3, y3, x4, y4]')`,
      `hotkey(key='')`,
      `type(content='') #If you want to submit your input, use "\\n" at the end of \`content\`.`,
      `scroll(start_box='[x1, y1, x2, y2]', direction='down or up or right or left')`,
      `wait() #Sleep for 5s and take a screenshot to check for any changes.`,
      `finished()`,
      `call_user() # Submit the task and call the user when the task is unsolvable, or when you need the user's help.`,
    ],
  };

  /**
   * Take a full desktop screenshot.
   *
   * We grab the scaled screen, then resize it back to physical dimensions
   * to keep the coordinate system consistent with the model.
   */
  async screenshot(): Promise<ScreenshotOutput> {
    const grabImage = await screen.grab();
    const screenWithScale = await grabImage.toRGB();

    const scaleFactor = screenWithScale.pixelDensity.scaleX;

    const screenWithScaleImage = await Jimp.fromBitmap({
      width: screenWithScale.width,
      height: screenWithScale.height,
      data: Buffer.from(screenWithScale.data),
    });

    const width = screenWithScale.width / screenWithScale.pixelDensity.scaleX;
    const height =
      screenWithScale.height / screenWithScale.pixelDensity.scaleY;

    const physicalScreenImage = await screenWithScaleImage
      .resize({
        w: width,
        h: height,
      })
      .getBuffer('image/png');

    return {
      base64: physicalScreenImage.toString('base64'),
      scaleFactor,
    };
  }

  /**
   * Execute an action parsed from the model output.
   */
  async execute(params: ExecuteParams): Promise<ExecuteOutput> {
    const { parsedPrediction, screenWidth, screenHeight } = params;
    const { action_type, action_inputs } = parsedPrediction;
    const startBoxStr = action_inputs?.start_box || '';

    const { x: startX, y: startY } = parseBoxToScreenCoords({
      boxStr: startBoxStr,
      screenWidth,
      screenHeight,
    });

    mouse.config.mouseSpeed = 3600;

    const getHotkeys = (keyStr: string | undefined): Key[] => {
      if (!keyStr) return [];

      const platformCommandKey =
        process.platform === 'darwin' ? Key.LeftCmd : Key.LeftWin;
      const platformCtrlKey =
        process.platform === 'darwin' ? Key.LeftCmd : Key.LeftControl;

      const keyMap = {
        return: Key.Enter,
        ctrl: platformCtrlKey,
        shift: Key.LeftShift,
        alt: Key.LeftAlt,
        'page down': Key.PageDown,
        'page up': Key.PageUp,
        meta: platformCommandKey,
        win: platformCommandKey,
        command: platformCommandKey,
        cmd: platformCommandKey,
        ',': Key.Comma,
        arrowup: Key.Up,
        arrowdown: Key.Down,
        arrowleft: Key.Left,
        arrowright: Key.Right,
      } as const;

      const lowercaseKeyMap = Object.fromEntries(
        Object.entries(Key).map(([k, v]) => [k.toLowerCase(), v]),
      ) as {
        [K in keyof typeof Key as Lowercase<K>]: (typeof Key)[K];
      };

      const keys = keyStr
        .split(/[\s+]/)
        .map((k) => k.toLowerCase())
        .map(
          (k) =>
            keyMap[k as keyof typeof keyMap] ??
            lowercaseKeyMap[k as Lowercase<keyof typeof Key>],
        )
        .filter(Boolean);

      return keys;
    };

    switch (action_type) {
      case 'wait': {
        await sleep(5000);
        break;
      }

      case 'mouse_move':
      case 'hover': {
        await moveStraightTo(startX, startY);
        break;
      }

      case 'click':
      case 'left_click':
      case 'left_single': {
        await moveStraightTo(startX, startY);
        await sleep(100);
        await mouse.click(Button.LEFT);
        break;
      }

      case 'left_double':
      case 'double_click': {
        await moveStraightTo(startX, startY);
        await sleep(100);
        await mouse.doubleClick(Button.LEFT);
        break;
      }

      case 'right_click':
      case 'right_single': {
        await moveStraightTo(startX, startY);
        await sleep(100);
        await mouse.click(Button.RIGHT);
        break;
      }

      case 'middle_click': {
        await moveStraightTo(startX, startY);
        await mouse.click(Button.MIDDLE);
        break;
      }

      case 'left_click_drag':
      case 'drag':
      case 'select': {
        const endBox = action_inputs?.end_box;
        if (endBox) {
          const { x: endX, y: endY } = parseBoxToScreenCoords({
            boxStr: endBox,
            screenWidth,
            screenHeight,
          });

          if (startX && startY && endX && endY) {
            await moveStraightTo(startX, startY);
            await sleep(100);
            await mouse.drag(straightTo(new Point(endX, endY)));
          }
        }
        break;
      }

      case 'type': {
        const content = action_inputs.content?.trim();
        if (content) {
          const stripContent = content.replace(/\\n$/, '').replace(/\n$/, '');
          keyboard.config.autoDelayMs = 0;

          if (process.platform === 'win32') {
            const originalClipboard = await clipboard.getContent();
            await clipboard.setContent(stripContent);
            await keyboard.pressKey(Key.LeftControl, Key.V);
            await sleep(50);
            await keyboard.releaseKey(Key.LeftControl, Key.V);
            await sleep(50);
            await clipboard.setContent(originalClipboard);
          } else {
            await keyboard.type(stripContent);
          }

          if (content.endsWith('\n') || content.endsWith('\\n')) {
            await keyboard.pressKey(Key.Enter);
            await keyboard.releaseKey(Key.Enter);
          }

          keyboard.config.autoDelayMs = 500;
        }
        break;
      }

      case 'hotkey': {
        const keyStr = action_inputs?.key || action_inputs?.hotkey;
        const keys = getHotkeys(keyStr);
        if (keys.length > 0) {
          await keyboard.pressKey(...keys);
          await keyboard.releaseKey(...keys);
        }
        break;
      }

      case 'press': {
        const keyStr = action_inputs?.key || action_inputs?.hotkey;
        const keys = getHotkeys(keyStr);
        if (keys.length > 0) {
          await keyboard.pressKey(...keys);
        }
        break;
      }

      case 'release': {
        const keyStr = action_inputs?.key || action_inputs?.hotkey;
        const keys = getHotkeys(keyStr);
        if (keys.length > 0) {
          await keyboard.releaseKey(...keys);
        }
        break;
      }

      case 'scroll': {
        const { direction } = action_inputs;
        if (startX !== null && startY !== null) {
          await moveStraightTo(startX, startY);
        }

        switch (direction?.toLowerCase()) {
          case 'up':
            await mouse.scrollUp(5 * 100);
            break;
          case 'down':
            await mouse.scrollDown(5 * 100);
            break;
          default:
            break;
        }
        break;
      }

      case 'error_env':
      case 'call_user':
      case 'finished':
      case 'user_stop': {
        return { status: StatusEnum.END };
      }

      default:
        // Unknown actions are ignored but keep the loop running
        break;
    }

    return { status: StatusEnum.RUNNING };
  }
}

