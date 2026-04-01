import { describe, it, expect } from 'vitest';

function renderPrompt(template: string, input: string): string {
  return template.replace('{INPUT_PLACEHOLDER}', input);
}

describe('prompt rendering', () => {
  it('replaces {INPUT_PLACEHOLDER} with input', () => {
    const template = 'Process this: {INPUT_PLACEHOLDER}\nOutput:';
    expect(renderPrompt(template, 'hello world')).toBe('Process this: hello world\nOutput:');
  });

  it('handles empty input', () => {
    const template = 'Input: {INPUT_PLACEHOLDER}\nOutput:';
    expect(renderPrompt(template, '')).toBe('Input: \nOutput:');
  });

  it('handles input containing placeholder literal', () => {
    const template = 'Input: {INPUT_PLACEHOLDER}\nOutput:';
    const input = 'text with {INPUT_PLACEHOLDER} inside';
    const result = renderPrompt(template, input);
    expect(result).toBe('Input: text with {INPUT_PLACEHOLDER} inside\nOutput:');
  });

  it('handles multiline input', () => {
    const template = '[PSEUDO_PROGRAM]\nTask: classify\n{INPUT_PLACEHOLDER}\nOutput:';
    const input = 'line1\nline2\nline3';
    const result = renderPrompt(template, input);
    expect(result).toContain('line1\nline2\nline3');
  });

  it('handles very long input', () => {
    const template = '{INPUT_PLACEHOLDER}';
    const input = 'a'.repeat(10000);
    expect(renderPrompt(template, input)).toBe(input);
  });

  it('preserves template text around placeholder', () => {
    const template = '<|im_start|>system\n[PSEUDO_PROGRAM]\nDo something\n[END_PSEUDO_PROGRAM]\n<|im_end|>\n<|im_start|>user\n{INPUT_PLACEHOLDER}<|im_end|>\n<|im_start|>assistant\n';
    const result = renderPrompt(template, 'test input');
    expect(result).toContain('[PSEUDO_PROGRAM]');
    expect(result).toContain('test input');
    expect(result).toContain('assistant');
  });
});
