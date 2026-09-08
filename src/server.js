require('dotenv').config();

const app = require('./app');
const connectDatabase = require('./config/database');

const port = process.env.PORT || 3000;

connectDatabase().then(() => {
  app.listen(port, () => {
    console.log(`cclu-api listening on port ${port}`);
  });
});
