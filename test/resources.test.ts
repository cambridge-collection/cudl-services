import {
  aggregate,
  BaseResource,
  closingOnError,
  Resource,
  Resources,
  using,
} from '../src/resources';

class MyResource extends BaseResource {
  example() {
    this.ensureNotClosed();
  }
}

const MockResource = jest.fn<Resource, []>(() => ({close: jest.fn()}));

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

  describe('closingOnError', () => {
    test('user is called with non-promise resource', async () => {
      const resource = new MockResource();
      const user = jest.fn();

      await closingOnError(resource, user);
      expect(user).toHaveBeenCalledTimes(1);
      expect(user).toHaveBeenCalledWith(resource);
    });

    test('user is called with resolved resource from resource promise', async () => {
      const resource = new MockResource();
      const user = jest.fn();

      await closingOnError(Promise.resolve(resource), user);
      expect(user).toHaveBeenCalledTimes(1);
      expect(user).toHaveBeenCalledWith(resource);
    });

    test('returns result of user', async () => {
      const resource = new MockResource();
      const user = jest.fn().mockResolvedValueOnce(42);

      const result = await closingOnError(resource, user);
      expect(result).toBe(42);
      expect(resource.close).not.toHaveBeenCalled();
    });

    test('closes resource if user fails', async () => {
      const resource = new MockResource();
      const user = jest.fn().mockRejectedValueOnce(new Error('boom'));

      await expect(closingOnError(resource, user)).rejects.toThrow(
        new Error('boom')
      );
      expect(resource.close).toHaveBeenCalled();
    });
  });

  describe('Resources', () => {
    test('closes held Resources', async () => {
      const a = new MockResource();
      const b = new MockResource();

      const combined = new Resources([a, b]);

      expect(a.close).not.toHaveBeenCalled();
      expect(b.close).not.toHaveBeenCalled();

      await combined.close();

      expect(combined.isClosed()).toBeTruthy();
      expect(a.close).toHaveBeenCalled();
      expect(b.close).toHaveBeenCalled();
    });
  });

  describe('aggregate', () => {
    test('closes aggregated resources', async () => {
      const a = new MockResource();
      const b = new MockResource();

      const combined = aggregate(a, b);

      expect(a.close).not.toHaveBeenCalled();
      expect(b.close).not.toHaveBeenCalled();

      await combined.close();

      expect(combined.isClosed()).toBeTruthy();
      expect(a.close).toHaveBeenCalled();
      expect(b.close).toHaveBeenCalled();
    });
  });
});
