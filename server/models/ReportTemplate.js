import mongoose from 'mongoose';

// A saved report layout: which sections to include plus default filters. Owned by a user,
// optionally shared with everyone who can open Reports.
const reportTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Template name is required'], trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 300 },
    sections: { type: [String], validate: [(v) => v.length > 0, 'Choose at least one section'] },
    filters: { type: mongoose.Schema.Types.Mixed, default: {} },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    shared: { type: Boolean, default: false },
  },
  { timestamps: true }
);

reportTemplateSchema.index({ owner: 1, name: 1 });

const ReportTemplate = mongoose.model('ReportTemplate', reportTemplateSchema);
export default ReportTemplate;
