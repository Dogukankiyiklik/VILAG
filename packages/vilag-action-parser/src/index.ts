/**
 * VILAG - Action Parser
 * Parses model output (Thought + Action) into structured action objects.
 * Supports v1.0, v1.5, and Doubao coordinate formats.
 */
import type { PredictionParsed } from '@vilag/shared/types';
import {
  UITarsModelVersion,
  MAX_RATIO,
  IMAGE_FACTOR,
  MIN_PIXELS,
  MAX_PIXELS_V1_5,
} from '@vilag/shared/constants';

// ===== Smart Resize (v1.5) =====

function roundByFactor(num: number, factor: number): number {
  return Math.round(num / factor) * factor;
}

function floorByFactor(num: number, factor: number): number {
  return Math.floor(num / factor) * factor;
}

function ceilByFactor(num: number, factor: number): number {
  return Math.ceil(num / factor) * factor;
}

/**
 * Compute the resized dimensions that the v1.5 model uses internally.
 * The model sees the image at these dimensions, so coordinates are
 * relative to this size — not the original screen size.
 */
export function smartResizeForV15(
  height: number,
  width: number,
  maxRatio: number = MAX_RATIO,
  factor: number = IMAGE_FACTOR,
  minPixels: number = MIN_PIXELS,
  maxPixels: number = MAX_PIXELS_V1_5,
): [number, number] | null {
  if (Math.max(height, width) / Math.min(height, width) > maxRatio) {
    console.error(
      `Aspect ratio too large: ${Math.max(height, width) / Math.min(height, width)} > ${maxRatio}`,
    );
    return null;
  }

  let wBar = Math.max(factor, roundByFactor(width, factor));
  let hBar = Math.max(factor, roundByFactor(height, factor));

  if (hBar * wBar > maxPixels) {
    const beta = Math.sqrt((height * width) / maxPixels);
    hBar = floorByFactor(height / beta, factor);
    wBar = floorByFactor(width / beta, factor);
  } else if (hBar * wBar < minPixels) {
    const beta = Math.sqrt(minPixels / (height * width));
    hBar = ceilByFactor(height * beta, factor);
    wBar = ceilByFactor(width * beta, factor);
  }

  return [wBar, hBar];
}

// ===== Main Parser =====

export interface ParseActionOptions {
  /** Screen dimensions — required for v1.5 smart resize scaling */
  screenContext?: { width: number; height: number };
  /** Model version — determines coordinate format. Default: V1_5 */
  modelVersion?: UITarsModelVersion;
  /**
   * Factor to divide raw coordinates by.
   * v1.0 uses [1000, 1000], v1.5 uses smartResize dimensions.
   * If not provided, auto-detected from modelVersion + screenContext.
   */
  factor?: [number, number];
}

/**
 * Parse a raw model prediction string into structured action objects.
 * Supports formats:
 *   - click(start_box='<|box_start|>(x1,y1)<|box_end|>') [v1.5]
 *   - click(start_box='[x1, y1, x2, y2]')                [v1.0]
 *   - click(point='<point>x1 y1</point>')                 [doubao]
 */
export function parseAction(prediction: string, options: ParseActionOptions = {}): PredictionParsed[] {
  const {
    screenContext,
    modelVersion = UITarsModelVersion.V1_5,
    factor,
  } = options;

  const results: PredictionParsed[] = [];

  // Determine coordinate scaling factors
  let factors: [number, number];
  if (factor) {
    factors = factor;
  } else if (modelVersion === UITarsModelVersion.V1_5 && screenContext) {
    const resized = smartResizeForV15(screenContext.height, screenContext.width);
    factors = resized || [1000, 1000];
  } else {
    factors = [1000, 1000];
  }

  // Extract thought
  const thoughtMatch = prediction.match(/Thought:\s*([\s\S]*?)(?=\nAction:|$)/i);
  const thought = thoughtMatch?.[1]?.trim() || '';

  // Extract action lines (may have multiple separated by \n\n)
  const actionMatch = prediction.match(/Action:\s*([\s\S]*?)$/i);
  if (!actionMatch) {
    return [{
      action_type: 'wait',
      action_inputs: {},
      thought,
    }];
  }

  const actionText = actionMatch[1].trim();
  const actionLines = actionText.split(/\n\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of actionLines) {
    const parsed = parseSingleAction(line, factors, screenContext);
    if (parsed) {
      parsed.thought = thought;
      results.push(parsed);
    }
  }

  return results.length > 0 ? results : [{
    action_type: 'wait',
    action_inputs: {},
    thought,
  }];
}

function parseSingleAction(
  actionStr: string,
  factors: [number, number],
  screenContext?: { width: number; height: number },
): PredictionParsed | null {
  // Strip v1.5 box markers for uniform parsing
  actionStr = actionStr.replace(/<\|box_start\|>|<\|box_end\|>/g, '');

  // Normalize point/start_point/end_point → start_box/end_box
  actionStr = actionStr
    .replace(/(?<!start_|end_)point=/g, 'start_box=')
    .replace(/start_point=/g, 'start_box=')
    .replace(/end_point=/g, 'end_box=');

  // Match: action_name(key='value', key2='value2')
  const funcMatch = actionStr.match(/^(\w+)\((.*)\)$/s);
  if (!funcMatch) {
    // Simple actions: wait(), finished()
    const simpleMatch = actionStr.match(/^(\w+)\(\s*\)$/);
    if (simpleMatch) {
      return {
        action_type: simpleMatch[1],
        action_inputs: {},
      };
    }
    return null;
  }

  const actionType = funcMatch[1];
  const paramsStr = funcMatch[2];
  const actionInputs: Record<string, any> = {};

  // Parse key='value' pairs (handles commas inside quotes)
  const argPairs = paramsStr.match(/([^,']|'[^']*')+/g) || [];

  for (const pair of argPairs) {
    const [key, ...valueParts] = pair.split('=');
    if (!key || valueParts.length === 0) continue;

    const keyTrimmed = key.trim();
    let value: string = valueParts.join('=').trim().replace(/^['"]|['"]$/g, '');

    if (keyTrimmed === 'start_box' || keyTrimmed === 'end_box') {
      // Handle <bbox> format: <bbox>637 964 637 964</bbox>
      if (value.includes('<bbox>')) {
        value = value.replace(/<bbox>|<\/bbox>/g, '').replace(/\s+/g, ',');
        value = `(${value})`;
      }
      // Handle <point> format: <point>510 150</point>
      if (value.includes('<point>')) {
        value = value.replace(/<point>|<\/point>/g, '').replace(/\s+/g, ',');
        value = `(${value})`;
      }

      // Parse numbers from the coordinate string
      const numbers = value.replace(/[()[\]]/g, '').split(',').filter(Boolean);
      const scaled = numbers.map((num, idx) => {
        const factorIndex = idx % 2;
        return parseFloat(num) / factors[factorIndex];
      });

      // If only 2 numbers (point), duplicate for box format
      if (scaled.length === 2) {
        scaled.push(scaled[0], scaled[1]);
      }

      // Store raw scaled box
      actionInputs[keyTrimmed] = JSON.stringify(scaled);

      // Compute pixel coordinates (center of box) if screen context available
      if (screenContext) {
        const coordsKey = keyTrimmed === 'start_box' ? 'start_coords' : 'end_coords';
        const [x1, y1, x2 = x1, y2 = y1] = scaled;
        actionInputs[coordsKey] = [
          Math.round(((x1 + x2) / 2) * screenContext.width),
          Math.round(((y1 + y2) / 2) * screenContext.height),
        ];
      }
    } else if (keyTrimmed === 'content') {
      // Unescape content string
      actionInputs[keyTrimmed] = value
        .replace(/\\n/g, '\n')
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"');
    } else {
      actionInputs[keyTrimmed] = value;
    }
  }

  return {
    action_type: actionType,
    action_inputs: actionInputs,
  };
}

export { parseSingleAction, smartResizeForV15 as smartResize };
