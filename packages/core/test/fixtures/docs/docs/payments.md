# Payments

Prose before any claim, so the preamble is a section of its own and the coverage
denominator is not quietly reduced.

## Charging

Charging audits the amount before it reaches a gateway.

<!-- codedocs: calls(src/payments.ts#charge, src/payments.ts#audit) -->

Checkout reaches the audit two hops out, which no call edge states on its own.

<!-- codedocs: reaches(src/checkout.ts#checkout,
                       src/payments.ts#audit) -->

## Gateways

There are exactly two implementations. A third is what this catches.

<!-- codedocs: implementations(src/types.ts#Gateway) == 2 -->

The audit is called from one place and from nowhere outside the source tree.

<!-- codedocs: callers(src/payments.ts#audit) == 1 -->
<!-- codedocs: onlyCalledBy(src/payments.ts#audit, src/) -->

## What does not happen

The audit does not charge, which is the encapsulation the prose promises.

<!-- codedocs: !calls(src/payments.ts#audit, src/payments.ts#charge) -->

## Uncovered

This section makes an assertion in prose and none codedocs can check, which is
what claim coverage exists to report.
