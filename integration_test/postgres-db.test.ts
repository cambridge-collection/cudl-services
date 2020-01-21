import { BasePostgresDAO, PostgresDatabasePool } from '../src/db';
import { using } from '../src/resources';
import { factory } from '../src/util';
import { connectionDetails } from './config';

describe('PostgresDatabasePool', () => {
  test('fromConfig()', async () => {
    expect.assertions(1);
    await using(
      PostgresDatabasePool.fromConfig({
        postHost: connectionDetails.host,
        postPort: connectionDetails.port,
        postUser: connectionDetails.user,
        postPass: connectionDetails.password,
        postDatabase: connectionDetails.database,
      }),
      async dbPool => {
        await using(
          dbPool.getClient(factory(BasePostgresDAO)),
          async (db: BasePostgresDAO) => {
            await expect(
              (await db.getClient().query('SELECT 1 AS value')).rows
            ).toEqual([{ value: 1 }]);
          }
        );
      }
    );
  });
});

describe('BasePostgresDAO', () => {
  test('createPool', async () => {
    expect.assertions(1);
    await using(
      PostgresDatabasePool.fromConfig({
        postHost: connectionDetails.host,
        postPort: connectionDetails.port,
        postUser: connectionDetails.user,
        postPass: connectionDetails.password,
        postDatabase: connectionDetails.database,
      }),
      async dbPool => {
        const pool = BasePostgresDAO.createPool(dbPool);

        await using(pool.getInstance(), async dao => {
          await expect(
            (await dao.getClient().query('SELECT 1 AS value')).rows
          ).toEqual([{ value: 1 }]);
        });
      }
    );
  });
});
