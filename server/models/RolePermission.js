import mongoose from 'mongoose';

// One document per role, listing the module keys that role can access.
// Seeded with sensible defaults; editable from Settings > Roles & Permissions.
const rolePermissionSchema = new mongoose.Schema(
  {
    role: { type: String, required: true, unique: true },
    label: { type: String, required: true },
    permissions: [{ type: String }], // e.g. ['dashboard.view', 'pos.create', 'reports.view']
  },
  { timestamps: true }
);

const RolePermission = mongoose.model('RolePermission', rolePermissionSchema);
export default RolePermission;
