require('dotenv').config();

const app = require('./app');
const connectDatabase = require('./config/database');

const REQUIRED_ENV = ['MONGODB_URI'];

const missingEnv = REQUIRED_ENV.filter((name) => !process.env[name]);

if (missingEnv.length > 0) {
  console.error(`Missing environment variables: ${missingEnv.join(', ')}`);
  console.error('Copy .env.example to .env and fill in the values.');
  process.exit(1);
}

const port = process.env.PORT || 3000;

connectDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`cclu-api listening on port ${port}`);
    });
  })
  .catch((error) => {
    console.error(`Could not connect to MongoDB: ${error.message}`);
    process.exit(1);
  });
