import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import RackItem from '../models/RackItem.js';

// Sample Rack Locator entries. Upserted by serial number, so re-running is safe and
// products added by hand are left untouched.
const ITEMS = [
  // Rack A - Pain relief & fever
  { name: 'Crocin Advance 500', serialNumber: 'CRA500001', rack: 'A', quantity: 45 },
  { name: 'Calpol 650', serialNumber: 'CAL650001', rack: 'A', quantity: 32 },
  { name: 'Combiflam', serialNumber: 'CMB400001', rack: 'A', quantity: 28 },
  { name: 'Saridon', serialNumber: 'SRD100001', rack: 'A', quantity: 0 },
  { name: 'Disprin', serialNumber: 'DSP350001', rack: 'A', quantity: 60 },

  // Rack B - Cold, cough & allergy
  { name: 'Vicks Action 500', serialNumber: 'VKA500001', rack: 'B', quantity: 40 },
  { name: 'Benadryl Cough Syrup 100ml', serialNumber: 'BND100001', rack: 'B', quantity: 18 },
  { name: 'Cetirizine 10mg', serialNumber: 'CTZ010001', rack: 'B', quantity: 75 },
  { name: 'Sinarest', serialNumber: 'SNR500001', rack: 'B', quantity: 22 },
  { name: 'Strepsils Honey Lemon', serialNumber: 'STP008001', rack: 'B', quantity: 50 },

  // Rack C - Digestive care
  { name: 'Digene Mint Tablets', serialNumber: 'DGN015001', rack: 'C', quantity: 35 },
  { name: 'Eno Lemon 5g', serialNumber: 'ENO005001', rack: 'C', quantity: 120 },
  { name: 'Pan 40', serialNumber: 'PAN040001', rack: 'C', quantity: 26 },
  { name: 'Gelusil MPS Syrup 200ml', serialNumber: 'GLS200001', rack: 'C', quantity: 3 },

  // Rack D - Fever & antibiotics
  { name: 'Dolo 650', serialNumber: 'D650001', rack: 'D', quantity: 20 },
  { name: 'Dolo 500', serialNumber: 'D500001', rack: 'D', quantity: 15 },
  { name: 'Azithral 500', serialNumber: 'AZT500001', rack: 'D', quantity: 12 },
  { name: 'Augmentin 625 Duo', serialNumber: 'AUG625001', rack: 'D', quantity: 8 },

  // Rack E - Vitamins & supplements
  { name: 'Becosules Capsules', serialNumber: 'BCS020001', rack: 'E', quantity: 30 },
  { name: 'Limcee 500 Vitamin C', serialNumber: 'LMC500001', rack: 'E', quantity: 55 },
  { name: 'Shelcal 500', serialNumber: 'SHC500001', rack: 'E', quantity: 24 },
  { name: 'Revital H', serialNumber: 'RVH030001', rack: 'E', quantity: 10 },

  // Rack F - First aid
  { name: 'Band-Aid Washproof 20s', serialNumber: 'BAD020001', rack: 'F', quantity: 40 },
  { name: 'Dettol Antiseptic 250ml', serialNumber: 'DTL250001', rack: 'F', quantity: 16 },
  { name: 'Savlon Antiseptic Cream 30g', serialNumber: 'SVL030001', rack: 'F', quantity: 21 },
  { name: 'Cotton Roll 100g', serialNumber: 'CTN100001', rack: 'F', quantity: 0 },

  // Numbered racks - personal care
  { name: 'Colgate Strong Teeth 200g', serialNumber: 'CLG200001', rack: '1', quantity: 48 },
  { name: 'Dove Soap 100g', serialNumber: 'DOV100001', rack: '1', quantity: 64 },
  { name: 'Himalaya Neem Face Wash 150ml', serialNumber: 'HNF150001', rack: '2', quantity: 27 },
  { name: 'Nivea Body Lotion 400ml', serialNumber: 'NVL400001', rack: '2', quantity: 14 },
  { name: 'Whisper Ultra XL 15s', serialNumber: 'WSP015001', rack: '10', quantity: 33 },
  { name: 'Pampers Pants M 56s', serialNumber: 'PMP056001', rack: '10', quantity: 9 },
];

async function run() {
  await connectDB();
  const result = await RackItem.bulkWrite(
    ITEMS.map((item) => ({
      updateOne: { filter: { serialNumber: item.serialNumber }, update: { $set: item }, upsert: true },
    }))
  );
  const racks = [...new Set(ITEMS.map((i) => i.rack))];
  console.log(`[seed:racks] ${ITEMS.length} rack products ready across ${racks.length} racks (${racks.join(', ')}).`);
  console.log(`             ${result.upsertedCount} added, ${result.modifiedCount} updated.`);
}

run()
  .then(() => mongoose.connection.close())
  .catch(async (err) => {
    console.error('[seed:racks] Failed:', err);
    await mongoose.connection.close();
    process.exit(1);
  });
