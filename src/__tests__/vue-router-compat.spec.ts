import { describe, expect, it, vi } from "vitest";

import { effect } from "@elfui/reactivity";

import {
  createRouter,
  createMemoryHistory,
  createWebHashHistory,
  createWebHistory,
  isNavigationFailure,
  NavigationFailureType,
  setActiveRouter,
  useRoute
} from "../index";

describe("Vue Router 4 compatible core semantics", () => {
  it("supports Vue Router-style history factories and base-aware hrefs", () => {
    const routes = [{ path: "/about", component: "about" }];
    const web = createRouter({ history: createWebHistory("/app/"), routes });
    const hash = createRouter({ history: createWebHashHistory("/app/"), routes });
    const memory = createRouter({ history: createMemoryHistory("/app/"), routes });

    expect(web.resolve("/about").href).toBe("/app/about");
    expect(hash.resolve("/about").href).toBe("/app#/about");
    expect(memory.resolve("/about").href).toBe("/app/about");
  });

  it("resolves relative locations and honors push({ replace: true })", async () => {
    const router = createRouter({
      mode: "memory",
      initialPath: "/users/42",
      routes: [
        { path: "/", component: "home" },
        { path: "/users/:id", component: "user" },
        { path: "/settings", component: "settings" },
        { path: "/one", component: "one" },
        { path: "/two", component: "two" }
      ]
    });

    expect(router.resolve("../settings").path).toBe("/settings");
    await router.push("/one");
    await router.push({ path: "/two", replace: true });
    router.back();

    expect(router.current.peek().path).toBe("/users/42");
  });

  it("normalizes query values like Vue Router", () => {
    const router = createRouter({
      mode: "memory",
      routes: [{ path: "/search", component: "search" }]
    });
    const parsed = router.resolve("/search?tag=one+two&flag&tag=three");
    const stringified = router.resolve({ path: "/search", query: { tag: ["one two", null], flag: null } });

    expect(parsed.query).toEqual({ tag: ["one two", "three"], flag: null });
    expect(stringified.fullPath).toBe("/search?tag=one%20two&tag&flag");
  });

  it("omits empty optional params when resolving named routes", () => {
    const router = createRouter({
      mode: "memory",
      routes: [{ path: "/users/:id?", name: "user", component: "user" }]
    });

    expect(router.resolve({ name: "user", params: { id: "" } }).path).toBe("/users");
  });

  it("passes saved positions to scrollBehavior on memory history traversal", async () => {
    const left = Object.getOwnPropertyDescriptor(window, "scrollX");
    const top = Object.getOwnPropertyDescriptor(window, "scrollY");
    Object.defineProperty(window, "scrollX", { configurable: true, value: 12 });
    Object.defineProperty(window, "scrollY", { configurable: true, value: 34 });
    const saved: Array<{ left?: number; top?: number } | null> = [];
    const router = createRouter({
      mode: "memory",
      routes: [
        { path: "/", component: "home" },
        { path: "/next", component: "next" }
      ],
      scrollBehavior(_to, _from, position) {
        saved.push(position);
        return null;
      }
    });

    await router.push("/next");
    router.back();
    await Promise.resolve();
    await Promise.resolve();

    expect(saved).toEqual([null, { left: 12, top: 34 }]);
    if (left) Object.defineProperty(window, "scrollX", left);
    if (top) Object.defineProperty(window, "scrollY", top);
  });

  it("prefers a static route over a dynamic route regardless of declaration order", () => {
    const router = createRouter({
      mode: "memory",
      initialPath: "/users/new",
      routes: [
        { path: "/users/:id", component: "user" },
        { path: "/users/new", component: "new-user" }
      ]
    });

    expect(router.current.peek().record?.component).toBe("new-user");
  });

  it("supports sensitive and strict matcher options", () => {
    const insensitive = createRouter({
      mode: "memory",
      initialPath: "/Users",
      routes: [{ path: "/users", component: "users" }]
    });
    const sensitive = createRouter({
      mode: "memory",
      sensitive: true,
      initialPath: "/Users",
      routes: [{ path: "/users", component: "users" }]
    });
    const strict = createRouter({
      mode: "memory",
      strict: true,
      initialPath: "/users/",
      routes: [{ path: "/users", component: "users" }]
    });

    expect(insensitive.current.peek().record?.component).toBe("users");
    expect(sensitive.current.peek().record).toBeNull();
    expect(strict.current.peek().record).toBeNull();
  });

  it("honors custom parameter regular expressions", () => {
    const routes = [
      { path: "/orders/:id(\\d+)", component: "order" },
      { path: "/orders/:slug", component: "order-slug" }
    ];
    const numeric = createRouter({ mode: "memory", initialPath: "/orders/42", routes });
    const text = createRouter({ mode: "memory", initialPath: "/orders/latest", routes });

    expect(numeric.current.peek().record?.component).toBe("order");
    expect(text.current.peek().record?.component).toBe("order-slug");
  });

  it("runs beforeEnter only when entering a record", async () => {
    const beforeEnter = vi.fn();
    const router = createRouter({
      mode: "memory",
      initialPath: "/users/1",
      routes: [{ path: "/users/:id", component: "user", beforeEnter }]
    });

    await router.push("/users/2");

    expect(beforeEnter).not.toHaveBeenCalled();
  });

  it("merges parent and child meta with child values taking precedence", () => {
    const router = createRouter({
      mode: "memory",
      initialPath: "/admin/users",
      routes: [
        {
          path: "/admin",
          component: "admin-layout",
          meta: { requiresAuth: true, section: "admin" },
          children: [
            {
              path: "users",
              component: "users",
              meta: { section: "users", title: "Users" }
            }
          ]
        }
      ]
    });

    expect(router.current.peek().meta).toEqual({
      requiresAuth: true,
      section: "users",
      title: "Users"
    });
  });

  it("applies a parent alias to nested child paths", () => {
    const router = createRouter({
      mode: "memory",
      initialPath: "/legacy/profile",
      routes: [
        {
          path: "/account",
          alias: "/legacy",
          component: "account",
          children: [{ path: "profile", component: "profile" }]
        }
      ]
    });

    expect(router.current.peek().record?.component).toBe("profile");
  });

  it("keeps useRoute reactive across replaced locations", async () => {
    const router = createRouter({
      mode: "memory",
      initialPath: "/users/1",
      routes: [{ path: "/users/:id", component: "user" }]
    });
    setActiveRouter(router);
    const route = useRoute();
    let id = "";
    const stop = effect(() => {
      id = String(route.params.id);
    });

    await router.push("/users/2");

    expect(id).toBe("2");
    stop.effect.stop();
  });

  it("maintains a memory history stack for back and forward", async () => {
    const router = createRouter({
      mode: "memory",
      routes: [
        { path: "/", component: "home" },
        { path: "/one", component: "one" },
        { path: "/two", component: "two" }
      ]
    });
    await router.push("/one");
    await router.push("/two");

    router.back();
    expect(router.current.peek().path).toBe("/one");
    router.forward();
    expect(router.current.peek().path).toBe("/two");
  });

  it("cancels an older navigation when a newer async navigation wins", async () => {
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const router = createRouter({
      mode: "memory",
      routes: [
        { path: "/", component: "home" },
        { path: "/slow", component: "slow" },
        { path: "/fast", component: "fast" }
      ]
    });
    router.beforeEach(async (to) => {
      if (to.path === "/slow") await firstGate;
    });

    const slow = router.push("/slow");
    const fast = router.push("/fast");
    releaseFirst?.();
    const failure = await slow;
    await fast;

    expect(isNavigationFailure(failure, NavigationFailureType.cancelled)).toBe(true);
    expect(router.current.peek().path).toBe("/fast");
  });
});
