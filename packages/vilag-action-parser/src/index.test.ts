import { describe, expect, it } from 'vitest';
import { parseAction } from './index';

describe('parseAction', () => {
  it('parses action type and box coordinates from model output', () => {
    const prediction = `Thought: Open search result
Action: click(start_box='<|box_start|>(120,340)<|box_end|>')`;

    const parsed = parseAction(prediction);

    expect(parsed).toEqual([
      {
        action_type: 'click',
        action_inputs: {
          start_box: { x: 120, y: 340 },
        },
        thought: 'Open search result',
      },
    ]);
  });

  it('returns wait action for empty model output', () => {
    const parsed = parseAction('');

    expect(parsed).toEqual([
      {
        action_type: 'wait',
        action_inputs: {},
        thought: '',
      },
    ]);
  });

  it('falls back to zero coordinates for invalid coordinate format', () => {
    const prediction = `Thought: Try click
Action: click(start_box='invalid-coordinate')`;

    const parsed = parseAction(prediction);

    expect(parsed).toEqual([
      {
        action_type: 'click',
        action_inputs: {
          start_box: { x: 0, y: 0 },
        },
        thought: 'Try click',
      },
    ]);
  });

  it('keeps undefined action type instead of dropping it', () => {
    const prediction = `Thought: Try custom action
Action: unknown_action(start_box='[0, 0, 100, 100]')`;

    const parsed = parseAction(prediction);

    expect(parsed).toEqual([
      {
        action_type: 'unknown_action',
        action_inputs: {
          start_box: { x: 50, y: 50 },
        },
        thought: 'Try custom action',
      },
    ]);
  });
});
