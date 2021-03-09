import {Config, isConfig, loadConfigFromModule} from '../src/config';

jest.mock(
  'example-config-module',
  () => {
    const config: Config = {
      createApplication: jest.fn(),
    };
    return config;
  },
  {virtual: true}
);

jest.mock(
  'example-invalid-config-module',
  () => {
    return {};
  },
  {virtual: true}
);

describe('loadConfigFromModule', () => {
  test('returns Config from valid module reference', async () => {
    const expectedConfig = require('example-config-module') as Config;

    await expect(loadConfigFromModule('example-config-module')).resolves.toBe(
      expectedConfig
    );
  });

  test('raises error when module does not exist', async () => {
    await expect(
      loadConfigFromModule('does/not/exist/sdfsdfa')
    ).rejects.toThrowErrorMatchingSnapshot();
  });

  test('raises error when module does not export a Config object', async () => {
    await expect(
      loadConfigFromModule('does/not/exist/sdfsdfa')
    ).rejects.toThrowErrorMatchingSnapshot();
  });
});

test.each([
  [undefined, false],
  [42, false],
  [{}, false],
  [{createApplication: undefined}, false],
  [{createApplication: 42}, false],
  [{createApplication: () => {}}, true],
])('isConfig(%j) = %j', (value, expected) => {
  expect(isConfig(value)).toBe(expected);
});
