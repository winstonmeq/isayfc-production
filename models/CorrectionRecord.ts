import mongoose, { Document, Model, Schema, Types } from "mongoose";

export type CorrectionEntity = "SALE" | "PAYMENT" | "DELIVERY";
export type CorrectionType =
  | "VOID"
  | "REVERSAL"
  | "REPLACEMENT"
  | "LATE_ENTRY"
  | "ADJUSTMENT"
  | "REALLOCATION";

export interface ICorrectionRecord extends Document {
  entityType: CorrectionEntity;
  entityId: Types.ObjectId;
  referenceNumber: string;
  correctionType: CorrectionType;
  reason: string;
  originalRecordId?: Types.ObjectId;
  replacementRecordId?: Types.ObjectId;
  transactionDate?: Date;
  correctedAt: Date;
  correctedBy?: Types.ObjectId;
  approvedBy?: Types.ObjectId;
  status: "COMPLETED" | "PENDING_APPROVAL" | "REJECTED";
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const CorrectionRecordSchema = new Schema<ICorrectionRecord>(
  {
    entityType: {
      type: String,
      enum: ["SALE", "PAYMENT", "DELIVERY"],
      required: true,
    },
    entityId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    referenceNumber: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },
    correctionType: {
      type: String,
      enum: [
        "VOID",
        "REVERSAL",
        "REPLACEMENT",
        "LATE_ENTRY",
        "ADJUSTMENT",
        "REALLOCATION",
      ],
      required: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    originalRecordId: { type: Schema.Types.ObjectId },
    replacementRecordId: { type: Schema.Types.ObjectId },
    transactionDate: { type: Date },
    correctedAt: { type: Date, required: true, default: Date.now },
    correctedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    status: {
      type: String,
      enum: ["COMPLETED", "PENDING_APPROVAL", "REJECTED"],
      default: "COMPLETED",
      required: true,
    },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

CorrectionRecordSchema.index({ entityType: 1, entityId: 1 });
CorrectionRecordSchema.index({ correctedAt: -1 });
CorrectionRecordSchema.index({ status: 1 });

const CorrectionRecordModel: Model<ICorrectionRecord> =
  mongoose.models.CorrectionRecord ||
  mongoose.model<ICorrectionRecord>(
    "CorrectionRecord",
    CorrectionRecordSchema
  );

export default CorrectionRecordModel;
