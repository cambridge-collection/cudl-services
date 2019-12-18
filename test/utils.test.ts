import { isEnumMember } from '../src/util';

test('isEnumMember', () => {
  expect.assertions(1);

  enum Foo {
    A = 'a',
    B = 'b',
  }

  function blah(f: Foo) {
    expect([Foo.A, Foo.B].includes(f)).toBeTruthy();
  }

  const val = 'b';

  if (isEnumMember(Foo, val)) {
    blah(val);
  }
});
