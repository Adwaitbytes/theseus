/**
 * Public deployments of an original and its regrowths, keyed by voyage then target id.
 * Each regrowth link was re-verified live with `theseus verify` against the deployed URL.
 */
export const liveDeployments: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "todomvc-jquery": {
    original: "https://theseus-todomvc-original.vercel.app",
    nextjs: "https://theseus-todomvc-nextjs.vercel.app",
    sveltekit: "https://theseus-todomvc-sveltekit.vercel.app",
  },
};
