import mongoose from 'mongoose';

const { Mixed } = mongoose.Schema.Types;

// One backup or restore (backup file -> Atlas) job, with its report. "migration" stays in the enum
// only so reports of earlier local -> Atlas migrations can still be read.
const migrationRunSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['migration', 'backup', 'restore'], required: true },
    status: { type: String, enum: ['running', 'completed', 'completed_with_errors', 'failed', 'interrupted'], default: 'running' },
    phase: { type: String, default: 'starting' }, // starting | backup | transfer | verify | done
    mode: { type: String }, // skip | overwrite | replace
    source: { type: Mixed },
    destination: { type: Mixed },
    items: { type: [Mixed], default: [] }, // per-collection counters
    totals: { type: Mixed },
    backupFile: { type: String },
    logs: { type: [Mixed], default: [] },
    issues: { type: [Mixed], default: [] }, // failed / duplicate-key records
    error: { type: String },
    startedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    startedByName: { type: String },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date },
  },
  { timestamps: true, minimize: false },
);

migrationRunSchema.index({ startedAt: -1 });

const MigrationRun = mongoose.model('MigrationRun', migrationRunSchema);
export default MigrationRun;
