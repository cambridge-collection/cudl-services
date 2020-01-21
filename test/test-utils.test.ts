import { product } from './utils';

test('productn', () => {
  expect(Array.from(product())).toEqual([[]]);
  expect(Array.from(product([1, 2, 3]))).toEqual([[1], [2], [3]]);
  expect(Array.from(product([1, 2, 3], ['a', 'b']))).toEqual([
    [1, 'a'],
    [1, 'b'],
    [2, 'a'],
    [2, 'b'],
    [3, 'a'],
    [3, 'b'],
  ]);
});
