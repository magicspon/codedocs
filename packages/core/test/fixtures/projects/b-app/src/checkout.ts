import { charge } from '../../a-lib/src/money.ts'

/** The caller. Its project owns this file; `money.ts` belongs to the other one. */
export const go = (): string => charge(1)
