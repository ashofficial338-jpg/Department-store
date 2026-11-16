import mongoose from 'mongoose';
import connectDB from '../config/db.js';

// Prints the document count of every collection, flagging the empty ones. Read-only.
await connectDB();
const { db } = mongoose.connection;
const names = (await db.listCollections().toArray()).map((c) => c.name).filter((n) => !n.startsWith('system.')).sort();
let total = 0;
for (const name of names) {
  const count = await db.collection(name).countDocuments();
  total += count;
  console.log(`${String(count).padStart(7)}  ${name}${count ? '' : '   <-- EMPTY'}`);
}
console.log(`${String(total).padStart(7)}  total in ${mongoose.connection.name}`);
await mongoose.connection.close();
