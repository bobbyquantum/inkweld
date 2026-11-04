import { fitsUsernameRule, USERNAME_MAX_LENGTH } from './username-rules';

describe('fitsUsernameRule', () => {
  it.each(['abc', 'Octo-Cat_42', 'a'.repeat(USERNAME_MAX_LENGTH)])(
    'accepts %j',
    name => {
      expect(fitsUsernameRule(name)).toBe(true);
    }
  );

  it.each([
    'ab',
    'a'.repeat(USERNAME_MAX_LENGTH + 1),
    'alice/bob',
    'alice:bob',
    'alice\\bob',
    'alice bob',
    'alice.bob',
    'josé',
  ])('rejects %j', name => {
    expect(fitsUsernameRule(name)).toBe(false);
  });
});
