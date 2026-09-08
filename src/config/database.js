const mongoose = require('mongoose');

async function connectDatabase() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');
}

module.exports = connectDatabase;
