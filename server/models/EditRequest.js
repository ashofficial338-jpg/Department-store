import mongoose from 'mongoose';

// A request from a non-admin user to change or delete an existing record (purchase order, product, brand,
// category, vendor). Only an administrator can approve it; approval applies the change through the same
// code path an administrator's own edit uses, so validation and the audit trail are identical.
export const EDIT_REQUEST_ENTITIES = ['Purchase', 'Product', 'Brand', 'Category', 'Vendor'];

const editRequestSchema = new mongoose.Schema(
  {
    entity: { type: String, enum: EDIT_REQUEST_ENTITIES, required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    entityLabel: { type: String, trim: true }, // e.g. PO number or product name at the time of the request
    action: { type: String, enum: ['update', 'delete'], required: true },
    changes: { type: mongoose.Schema.Types.Mixed }, // the proposed new values (update only)
    before: { type: mongoose.Schema.Types.Mixed }, // snapshot of the record when the request was made
    reason: { type: String, trim: true, maxlength: 500 },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'withdrawn'], default: 'pending' },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    requestedByName: String,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedByName: String,
    reviewedAt: Date,
    reviewRemarks: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

editRequestSchema.index({ status: 1, createdAt: -1 });
editRequestSchema.index({ entity: 1, entityId: 1, createdAt: -1 });
editRequestSchema.index({ requestedBy: 1, createdAt: -1 });

const EditRequest = mongoose.model('EditRequest', editRequestSchema);
export default EditRequest;
