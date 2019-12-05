import { AssertionError } from 'assert';
import { BaseResource, using } from '../src/resources';

class MyResource extends BaseResource {
  example() {
    this.ensureNotClosed();
  }
}

describe('resources', () => {
  describe('BaseResource', () => {
    test('ensureNotClosed() throws error after close()', () => {
      const resource = new MyResource();
      expect(resource.isClosed()).toBe(false);
      resource.example();
      resource.close();
      expect(resource.isClosed()).toBe(true);
      expect(resource.example.bind(resource)).toThrow(
        'operation on closed resource'
      );
    });
  });

  describe('using()', () => {
    test('user function receives resolved resource', async () => {
      const resource = new MyResource();

      await using(resource, r => {
        expect(r).toBe(resource);
      });

      await using(Promise.resolve(resource), r => {
        expect(r).toBe(resource);
      });
    });

    test('closes resource after successful user function execution', async () => {
      const resource = new MyResource();
      const result = await using(resource, () => 42);
      expect(result).toBe(42);
      expect(resource.isClosed()).toBe(true);
    });

    test('closes resource after failed user function execution', async () => {
      const resource = new MyResource();
      await expect(
        using(resource, () => {
          throw new Error('boom');
        })
      ).rejects.toThrow('boom');
      expect(resource.isClosed()).toBe(true);
    });

    test('throws error from rejected resource promise', async () => {
      const resource = new MyResource();
      await expect(
        using(Promise.reject(new Error('boom')), () => {
          // not reached
          expect(false).toBeTruthy();
        })
      ).rejects.toThrow('boom');
      // resource is not closed, as using() never received it
      expect(resource.isClosed()).toBe(false);
    });

    test('throws error from resource.close()', async () => {
      const resource = new MyResource();
      const failingClose = (resource.close = jest.fn(() => {
        throw new Error('boom');
      }));
      await expect(using(resource, () => 42)).rejects.toThrow('boom');
      expect(failingClose.mock.calls.length).toBe(1);
    });
  });
});
