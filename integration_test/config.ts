export const connectionDetails = {
  host: process.env.TEST_DB_HOST || 'localhost',
  port: Number(process.env.TEST_DB_PORT) || undefined,
  user: process.env.TEST_DB_USER || 'cudlservices',
  password: process.env.TEST_DB_PASSWORD || 'password',
  database: process.env.TEST_DB_DATABASE || 'cudlservices',
};
