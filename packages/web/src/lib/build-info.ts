/** Last bawilson2/mak-controller commit that is an ancestor of this repo. */
export const BASE_FORK_COMMIT = "9ea75e8c51b3c4051376fdcf97253e74ca75381f";

export const BASE_FORK_SOURCE = "bawilson2/mak-controller";

/**
 * How the base fork hash was determined:
 * this repo's history is linear. Commits through 9ea75e8 are authored by
 * Brian Wilson and match upstream HEAD of bawilson2/mak-controller
 * ("Add disclaimer and safety warning to README"). The next commit,
 * 98733bd, is the MakGrill rewrite.
 */
export const BASE_FORK_DETERMINATION =
  "Last ancestor from bawilson2/mak-controller before the MakGrill rewrite. Matches that repo's HEAD (9ea75e8, Brian Wilson).";

export function getBuildCommit(): string {
  return (process.env.NEXT_PUBLIC_GIT_COMMIT || process.env.GIT_COMMIT || "").trim();
}

export function shortSha(sha: string, length = 7): string {
  const trimmed = sha.trim();
  if (!trimmed) return "";
  return trimmed.slice(0, length);
}
