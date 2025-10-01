// Test setup file
const { sequelize } = require('../config/database');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.DB_NAME = 'eid_website_test';

beforeAll(async () => {
  // Set up test database
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  // Clean up
  await sequelize.close();
});
