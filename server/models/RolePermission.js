import mongoose from 'mongoose';

// One document per role, listing the permission keys that role can access
// (module keys like 'sales' plus dashboard keys like 'dashboard.financials').
// Seeded with sensible defaults; editable from Settings > Roles & Permissions.
const rolePermissionSchema = new mongoose.Schema(
  {
    role: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[a-z][a-z0-9_]{1,39}$/ },
    label: { type: String, required: true, trim: true },
    permissions: [{ type: String }],
    isSystem: { type: Boolean, default: false }, // built-in roles cannot be deleted
    // 1 = module-only matrix (before dashboard permissions existed); 2 = includes dashboard.* keys.
    version: { type: Number, default: 2 },
  },
  { timestamps: true }
);

const RolePermission = mongoose.model('RolePermission', rolePermissionSchema);
export default RolePermission;
