import type mongoose from "mongoose";

import CorrectionRecordModel, {
  type CorrectionEntity,
  type CorrectionType,
} from "@/models/CorrectionRecord";

export function correctionReason(value: unknown) {
  return String(value || "").trim();
}

export function requireCorrectionReason(value: unknown) {
  const reason = correctionReason(value);
  if (reason.length < 5) {
    throw new Error("A correction reason of at least 5 characters is required.");
  }
  return reason;
}

export async function recordCorrection({
  entityType,
  entityId,
  referenceNumber,
  correctionType,
  reason,
  transactionDate,
  correctedBy,
  originalRecordId,
  replacementRecordId,
  metadata,
  session,
}: {
  entityType: CorrectionEntity;
  entityId: mongoose.Types.ObjectId | string;
  referenceNumber?: string;
  correctionType: CorrectionType;
  reason: string;
  transactionDate?: Date;
  correctedBy?: string;
  originalRecordId?: mongoose.Types.ObjectId | string;
  replacementRecordId?: mongoose.Types.ObjectId | string;
  metadata?: Record<string, unknown>;
  session: mongoose.ClientSession;
}) {
  await CorrectionRecordModel.create(
    [
      {
        entityType,
        entityId,
        referenceNumber,
        correctionType,
        reason,
        transactionDate,
        correctedBy,
        originalRecordId,
        replacementRecordId,
        metadata,
        status: "COMPLETED",
      },
    ],
    { session }
  );
}
