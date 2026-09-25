export { normalizeAmount, isServerDecimal, movementFieldError } from './movement-input';
export type { MovementType } from './movement-input';
export { deriveExpected } from './expected';
export type { LedgerRow, Movement } from './expected';
export { parseMinor, validAmount, countVariance, overThreshold, denominationTotal, varianceText } from './register-count.helpers';
export { denominations } from './register-count.denominations';
export { registerSessionSchema, registerSessionCollection, cashMovementSchema, closureSchema } from './schemas';
export type { RegisterSession, CashMovement, Closure } from './schemas';
export {
  mintUuid, readRegister, ensureRegister, observeRegister$, getBoundRegisterId, readBoundRegister, bindRegister,
  unbindRegister, nextSaleCounter, mintClosureNumber, advancePerpetual,
} from './register-document';
export type { RegisterHost, RegisterCounters, RegisterBucket, RegisterStore, RegisterDocument } from './register-document';
export {
  RegisterSessionRequiredError, RegisterSessionClosedError, RegisterMovementStrandedError, openSessionSelector,
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
export { formatClosureDate, buildClosureDocument, buildXReportDocument } from './closure-document';
export type { ClosureContext } from './closure-document';
export { registerFactsLogger, recordRegisterFact, type Actor, type RegisterFact } from './facts';
