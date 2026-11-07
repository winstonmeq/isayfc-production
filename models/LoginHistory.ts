import mongoose, { Schema, type InferSchemaType } from "mongoose";

const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
  userName: { type: String, required: true },
  roleName: { type: String, default: "" },
  status: { type: String, enum: ["SUCCESS", "FAILED"], required: true },
  reason: { type: String, default: "" },
  loginAt: { type: Date, required: true, default: Date.now },
  lastActivityAt: Date,
  logoutAt: Date,
  expiresAt: Date,
}, { timestamps: true });
schema.index({ loginAt: -1, _id: -1 });
export type LoginHistoryRecord = InferSchemaType<typeof schema>;
const LoginHistory: mongoose.Model<LoginHistoryRecord> = (mongoose.models.LoginHistory as mongoose.Model<LoginHistoryRecord> | undefined) || mongoose.model<LoginHistoryRecord>("LoginHistory", schema);
export default LoginHistory;
