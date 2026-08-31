/** The callee, owned by the project that sorts first and so extracts first. */
export const charge = (amount: number): string => `stripe:${amount}`
