require('dotenv').config();

const app = require('./app');
const connectDatabase = require('./config/database');
const { findEnvironmentProblems } = require('./config/environment');
const { startMembershipExpiryJob } = require('./jobs/membershipExpiryJob');

const environmentProblems = findEnvironmentProblems();

if (environmentProblems.length > 0) {
  environmentProblems.forEach((problem) => console.error(problem));
  console.error('Copy .env.example to .env and fill in the values.');
  process.exit(1);
}

const port = process.env.PORT || 4000;

connectDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`cclu-api listening on port ${port}`);
    });
    startMembershipExpiryJob();
  })
  .catch((error) => {
    console.error(`Could not connect to MongoDB: ${error.message}`);
    process.exit(1);
  });
