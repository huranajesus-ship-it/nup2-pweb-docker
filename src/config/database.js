import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const createDatabase = async () => {
  const adminSequelize = new Sequelize('postgres', process.env.DB_USER, process.env.DB_PASSWORD, {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'postgres',
    logging: false
  });

  try {
    await adminSequelize.authenticate();
    console.log('Connected to PostgreSQL server');
    
    const [results] = await adminSequelize.query(
      `SELECT 1 FROM pg_database WHERE datname = '${process.env.DB_NAME}'`
    );
    
    if (results.length === 0) {
      await adminSequelize.query(`CREATE DATABASE "${process.env.DB_NAME}"`);
      console.log(`Database ${process.env.DB_NAME} created successfully`);
    } else {
      console.log(`Database ${process.env.DB_NAME} already exists`);
    }
  } catch (error) {
    console.error('Database creation error:', error.message);
    throw error;
  } finally {
    await adminSequelize.close();
  }
};

export const initializeDatabase = async () => {
  let retries = 10;
  while (retries > 0) {
    try {
      await createDatabase();
      break;
    } catch (error) {
      retries--;
      console.log(`Retrying database connection... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  if (retries === 0) {
    throw new Error('Failed to connect to database after multiple attempts');
  }
};