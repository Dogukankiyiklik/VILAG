/**
 * VILAG - Action Parser
 * Parses model output (Thought + Action) into structured action objects.
 */
import type { PredictionParsed } from '@vilag/shared/types';

/**
 * Parse a raw model prediction string into structured action objects.
 * Supports formats:
 *   - click(start_box='<|box_start|>(x1,y1)<|box_end|>') [v1.5]
 *   - click(start_box='[x1, y1, x2, y2]')                [v1.0]
 *   - click(point='<point>x1 y1</point>')                 [doubao]
 */
export function parseAction(prediction: string): PredictionParsed[] {
  const results: PredictionParsed[] = [];

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
    const parsed = parseSingleAction(line);
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

function parseSingleAction(actionStr: string): PredictionParsed | null {
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

  // Parse key='value' pairs
  const paramRegex = /(\w+)\s*=\s*'((?:[^'\\]|\\.)*)'/g;
  let match;
  while ((match = paramRegex.exec(paramsStr)) !== null) {
    const key = match[1];
    let value: any = match[2];

    // Parse coordinate formats
    if (key === 'start_box' || key === 'end_box') {
      value = parseCoordinates(value);
    } else if (key === 'point' || key === 'start_point' || key === 'end_point') {
      value = parsePointCoordinates(value);
    } else if (key === 'content') {
      // Unescape content
      value = value.replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\"/g, '"');
    }

    actionInputs[key] = value;
  }

  return {
    action_type: actionType,
    action_inputs: actionInputs,
  };
}

/**
 * Parse box coordinates: [x1, y1, x2, y2] or <|box_start|>(x1,y1)<|box_end|>
 */
function parseCoordinates(value: string): { x: number; y: number } | { x1: number; y1: number; x2: number; y2: number } {
  // Format: <|box_start|>(x1,y1)<|box_end|>
  const boxStartMatch = value.match(/<\|box_start\|>\((\d+),\s*(\d+)\)<\|box_end\|>/);
  if (boxStartMatch) {
    return {
      x: parseInt(boxStartMatch[1]),
      y: parseInt(boxStartMatch[2]),
    };
  }

  // Format: [x1, y1, x2, y2]
  const arrayMatch = value.match(/\[(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\]/);
  if (arrayMatch) {
    const x1 = parseInt(arrayMatch[1]);
    const y1 = parseInt(arrayMatch[2]);
    const x2 = parseInt(arrayMatch[3]);
    const y2 = parseInt(arrayMatch[4]);
    return {
      x: Math.round((x1 + x2) / 2),
      y: Math.round((y1 + y2) / 2),
    };
  }

  return { x: 0, y: 0 };
}

/**
 * Parse point coordinates: <point>x1 y1</point>
 */
function parsePointCoordinates(value: string): { x: number; y: number } {
  const pointMatch = value.match(/<point>(\d+)\s+(\d+)<\/point>/);
  if (pointMatch) {
    return {
      x: parseInt(pointMatch[1]),
      y: parseInt(pointMatch[2]),
    };
  }
  return { x: 0, y: 0 };
}

export { parseSingleAction, parseCoordinates, parsePointCoordinates };
