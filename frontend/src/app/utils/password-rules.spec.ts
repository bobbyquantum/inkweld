import { hasSpecialCharacter } from './password-rules';

describe('hasSpecialCharacter', () => {
  it.each(['#', '-', '_', '.', '!', '@', '~'])('accepts %s', ch => {
    expect(hasSpecialCharacter(`abc1${ch}`)).toBe(true);
  });

  it.each(['abc123', 'abc 123', ''])('rejects %j', pw => {
    expect(hasSpecialCharacter(pw)).toBe(false);
  });
});
