const AuditLog = require('../models/AuditLog');

async function logAudit({
  transactionId,
  transactionType,
  operation,
  updatedBy,
  previousSnapshot,
  newSnapshot,
  notes
}) {
  const auditEntry = new AuditLog({
    transactionId,
    transactionType,
    operation,
    updatedBy,
    previousSnapshot,
    newSnapshot,
    notes,
    updatedAt: new Date()
  });

  // Save without waiting for it
  auditEntry.save().catch((err) => {
    console.error('Audit Log Error:', err);
  });
}

module.exports = { logAudit };