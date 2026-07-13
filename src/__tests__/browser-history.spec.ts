import { afterEach, describe, expect, it, vi } from "vitest";

import { createRouter } from "../index";

const tick = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe("browser history navigation", () => {
  const initialUrl = window.location.href;
  const initialState = window.history.state;

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(initialState, "", initialUrl);
  });

  it("restores a rejected popstate navigation to its prior history entry", async () => {
    window.history.replaceState(null, "", "/");
    const router = createRouter({
      mode: "history",
      routes: [
        { path: "/", component: "home" },
        { path: "/blocked", component: "blocked" }
      ]
    });
    await router.push("/blocked");
    router.beforeEach((to) => (to.path === "/" ? false : undefined));
    const go = vi.spyOn(window.history, "go").mockImplementation(() => undefined);

    window.history.replaceState({ __elfRouterPosition: 0 }, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
    await tick();

    expect(router.current.peek().path).toBe("/blocked");
    expect(go).toHaveBeenCalledWith(1);
  });
});
