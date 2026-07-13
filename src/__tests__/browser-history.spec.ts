import { afterEach, describe, expect, it, vi } from "vitest";

import { createRouter, createWebHistory } from "../index";

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

  it("persists navigation state for push and replace", async () => {
    window.history.replaceState(null, "", "/");
    const router = createRouter({
      mode: "history",
      routes: [
        { path: "/", component: "home" },
        { path: "/details", component: "details" },
        { path: "/activity", component: "activity" }
      ]
    });

    await router.push({ path: "/details", state: { panel: "info" } });
    expect(window.history.state).toMatchObject({ panel: "info" });

    await router.replace({ path: "/activity", state: { panel: "activity" } });
    expect(window.history.state).toMatchObject({ panel: "activity" });
  });

  it("reads the current location relative to a history base boundary", () => {
    window.history.replaceState(null, "", "/app/users");
    const scoped = createRouter({
      history: createWebHistory("/app"),
      routes: [{ path: "/users", component: "users" }]
    });
    window.history.replaceState(null, "", "/application/users");
    const unscoped = createRouter({
      history: createWebHistory("/app"),
      routes: [{ path: "/application/users", component: "application-users" }]
    });

    expect(scoped.current.peek().path).toBe("/users");
    expect(unscoped.current.peek().path).toBe("/application/users");
  });
});
