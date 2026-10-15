// Ambient declarations for the type check of the pure helper files (npm run typecheck).
// match.js / helpers.js run in three places: CommonJS (Jest), the service worker and extension pages.
declare const module: { exports: any } | undefined;
