export { normalizeAmount, isServerDecimal, movementFieldError } from './movement-input';
export type { MovementType } from './movement-input';
export { deriveExpected } from './expected';
export type { LedgerRow, Movement } from './expected';
export { parseMinor, validAmount, countVariance, overThreshold, closeNeedsApproval, denominationTotal, varianceText } from './register-count.helpers';
export { denominations } from './register-count.denominations';
export { registerSessionSchema, registerSessionCollection, cashMovementSchema, closureSchema } from './schemas';
export type { RegisterSession, CashMovement, Closure } from './schemas';
export {
  mintUuid, readRegister, ensureRegister, observeRegister$, getBoundRegisterId, readBoundRegister, bindRegister,
  unbindRegister, nextSaleCounter, mintClosureNumber, advancePerpetual, RegisterIdInvalidError,
} from './register-document';
export type { RegisterHost, RegisterCounters, RegisterBucket, RegisterStore, RegisterDocument } from './register-document';
export {
  RegisterSessionRequiredError, RegisterSessionClosedError, RegisterMovementAmountError, RegisterMovementReasonError, RegisterMovementStrandedError, openSessionSelector,
  requireOpenSession, stampSession, openSession, startCounting, backToSelling, closeSession, recordMovement, voidMovement, writeClosure,
} from './session-store';
export type { RegisterSessionCollection, CashMovementCollection, ClosureCollection } from './session-store';
export { deriveSettled } from './settled-figures';
export type { Correction, RecordedFigures } from './settled-figures';
export { exportCsv } from './export-csv';
export { labelKeys } from './document-labels';
export { clampClosureScope, selectClosureRows } from './closure-rows';
export type { ClosureScope } from './closure-rows';
export { minorToDecimal } from './money';
export { formatClosureDate, buildClosureDocument, buildXReportDocument, TAX_ROUNDING_MIXED_NOTE } from './closure-document';
export type { ClosureContext } from './closure-document';
export { registerFactsLogger, recordRegisterFact, type Actor, type RegisterFact } from './facts';
export { useRegisterSession, RegisterTenderInProgressError, RegisterSessionAlreadyOpenError, RegisterCloseIncompleteError, RegisterApprovalRequiredError } from './use-register-session';
export type { UseRegisterSessionOptions } from './use-register-session';
export { registerCommandSchema, registerCommandCollection, registerCommandsLogger, sessionOpenCommand, sessionTransitionCommand, movementCommand, closureCommand, reconcileRegisterCommands } from './register-commands';
export type { RegisterCommand, RegisterCommandCollection } from './register-commands';
