import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';

// Creates (or resets) the Super Admin login without touching other data.
const ADMIN = { name: 'Ashwin Kumar', email: 'ashwinlav@gmail.com', role: 'super_admin', password: 'Admin@123' };

async function run() {
  await connectDB();
  let user = await User.findOne({ email: ADMIN.email });
  if (!user) user = new User(ADMIN);
  else Object.assign(user, { ...ADMIN, isActive: true });
  await user.save();
  console.log(`[seed:admin] Super Admin ready: ${ADMIN.email} / ${ADMIN.password}`);
  await mongoose.connection.close();
}

run().catch((err) => {
  console.error('[seed:admin] Failed:', err);
  process.exit(1);
});
