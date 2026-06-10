// The Vercel Edge runtime exposes process.env for configuration but not the
// full Node `process` surface. Declare just that slice so api/ typechecks
// under tsconfig.api.json without adding @types/node — the dependency
// allow-list (docs/INVARIANTS.md #9) keeps the toolchain closed.
declare const process: {
  env: Record<string, string | undefined>;
};
