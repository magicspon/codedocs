/**
 * Which prospects are actually in the running set.
 *
 * Every researched case lives in `prospects/`, frozen and ready. Only the ones
 * named here are run, preflighted, or reported on.
 *
 * The split exists because a case is expensive in a way that has nothing to do
 * with how good a case it is. Each codedocs run indexes its own fresh worktree
 * before the agent starts, and on vscode that has taken between 223 and 3,716
 * seconds. A full pool at three replicates is dozens of hours of indexing, most
 * of it spent rebuilding the same thing. So the pool is researched wide and run
 * narrow: prospects are added whenever a good case is found, and promoted here
 * when there is budget to run them.
 *
 * Anything reported from a narrow set has to say so, and the write-up does —
 * it counts the levels this set covers against the levels the rubric defines,
 * because the benchmark's whole claim is about how the delta *changes* between
 * levels, and a set inside one level cannot show a change in anything.
 */

/**
 * The running set, in the order the pool defines them.
 *
 * `333230` and `329610` are the two level 1 controls: both hand the file over
 * in the stack trace, so codedocs should buy little on either. Starting on the
 * cases least likely to flatter the tool is deliberate — a benchmark that
 * begins where it expects to win learns nothing from the first result.
 */
export const ACTIVE: readonly string[] = ['333230', '329610']
