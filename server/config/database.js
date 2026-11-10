const { Sequelize } = require('sequelize');
const pg = require('pg');

const isProduction = process.env.NODE_ENV === 'production';

// dialect = SQL family; dialectModule = Node driver.
// Sequelize does not bundle drivers. On Vercel, require('pg') + dialectModule
// so the Function bundle includes pg (Sequelize's dynamic require is often missed).
// https://github.com/vercel/community/discussions/234
const sequelize = new Sequelize(
  process.env.DB_NAME || 'eid_website',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || 'password',
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    dialectModule: pg,
    logging: isProduction ? false : console.log,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    ...(isProduction && {
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      }
    })
  }
);

module.exports = { sequelize };
