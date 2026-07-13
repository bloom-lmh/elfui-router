// F3.2-F3.6 / F4.1-F4.6 路由高级特性

import { afterEach, describe, expect, it, vi } from "vitest";

import { createRouter, isNavigationFailure, NavigationFailureType } from "../index";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("F3.2 路由级 beforeEnter", () => {
  it("数组形式的 beforeEnter 全部执行", async () => {
    const order: string[] = [];
    const router = createRouter({
      mode: "memory",
      routes: [
        {
          path: "/x",
          component: "x",
          beforeEnter: [
            () => {
              order.push("a");
            },
            () => {
              order.push("b");
            }
          ]
        }
      ]
    });
    await router.push("/x");
    expect(order).toEqual(["a", "b"]);
  });

  it("beforeEnter 返回 false 阻止", async () => {
    const router = createRouter({
      mode: "memory",
      initialPath: "/",
      routes: [
        { path: "/", component: "home" },
        { path: "/protected", component: "p", beforeEnter: () => false }
      ]
    });
    const r = await router.push("/protected");
    expect(isNavigationFailure(r)).toBe(true);
    expect((r as { type: string }).type).toBe(NavigationFailureType.aborted);
    expect(router.current.peek().path).toBe("/");
  });

  it("beforeEnter 返回字符串重定向", async () => {
    const router = createRouter({
      mode: "memory",
      routes: [
        { path: "/", component: "home" },
        { path: "/private", component: "p", beforeEnter: () => "/login" },
        { path: "/login", component: "login" }
      ]
    });
    await router.push("/private");
    expect(router.current.peek().path).toBe("/login");
  });
});

describe("F3.5 navigation failure", () => {
  it("重复导航返回 duplicated failure", async () => {
    const router = createRouter({
      mode: "memory",
      initialPath: "/x",
      routes: [{ path: "/x", component: "x" }]
    });
    const r = await router.push("/x");
    expect(isNavigationFailure(r)).toBe(true);
    expect((r as { type: string }).type).toBe(NavigationFailureType.duplicated);
  });

  it("失败导航也会传递给 afterEach", async () => {
    const router = createRouter({
      mode: "memory",
      initialPath: "/x",
      routes: [{ path: "/x", component: "x" }]
    });
    const afterEach = vi.fn();
    router.afterEach(afterEach);

    await router.push("/x");

    expect(afterEach).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/x" }),
      expect.objectContaining({ path: "/x" }),
      expect.objectContaining({ type: NavigationFailureType.duplicated })
    );
  });

  it("isNavigationFailure 判定", () => {
    expect(isNavigationFailure({ type: "aborted" })).toBe(true);
    expect(isNavigationFailure({ type: "duplicated" })).toBe(true);
    expect(isNavigationFailure({ type: "unknown" })).toBe(false);
    expect(isNavigationFailure(null)).toBe(false);
  });
});

describe("F3.6 onError", () => {
  it("守卫抛错被 onError 捕获", async () => {
    const router = createRouter({
      mode: "memory",
      routes: [{ path: "/x", component: "x" }]
    });
    const errorHandler = vi.fn();
    router.onError(errorHandler);
    router.beforeEach(() => {
      throw new Error("boom");
    });
    await expect(router.push("/x")).rejects.toThrow("boom");
    expect(errorHandler).toHaveBeenCalledTimes(1);
  });

  it("重定向循环会抛错并交给 onError", async () => {
    const router = createRouter({
      mode: "memory",
      routes: [
        { path: "/a", redirect: "/b" },
        { path: "/b", redirect: "/a" }
      ]
    });
    const errorHandler = vi.fn();
    router.onError(errorHandler);

    await expect(router.push("/a")).rejects.toThrow("Infinite redirect");
    expect(errorHandler).toHaveBeenCalledTimes(1);
  });
});

describe("F3.1 beforeResolve", () => {
  it("在 beforeEach 之后、afterEach 之前调用", async () => {
    const order: string[] = [];
    const router = createRouter({
      mode: "memory",
      routes: [{ path: "/x", component: "x" }]
    });
    router.beforeEach(() => {
      order.push("before");
    });
    router.beforeResolve(() => {
      order.push("resolve");
    });
    router.afterEach(() => {
      order.push("after");
    });
    await router.push("/x");
    expect(order).toEqual(["before", "resolve", "after"]);
  });

  it("在 beforeResolve 前加载异步路由组件", async () => {
    const order: string[] = [];
    const router = createRouter({
      mode: "memory",
      routes: [
        { path: "/", component: "home" },
        {
          path: "/lazy",
          component: () => {
            order.push("load");
            return Promise.resolve({ default: "lazy-page" });
          }
        }
      ]
    });
    router.beforeResolve(() => {
      order.push("resolve");
    });

    await router.push("/lazy");

    expect(order).toEqual(["load", "resolve"]);
  });
});

describe("F4.1 命名路由", () => {
  it("router.resolve 用 name 跳转", async () => {
    const router = createRouter({
      mode: "memory",
      routes: [{ path: "/users/:id", name: "user", component: "u" }]
    });
    const loc = router.resolve({ name: "user", params: { id: "42" } });
    expect(loc.path).toBe("/users/42");
    expect(loc.params.id).toBe("42");
  });

  it("router.push 接受命名 location", async () => {
    const router = createRouter({
      mode: "memory",
      routes: [{ path: "/users/:id", name: "user", component: "u" }]
    });
    await router.push({ name: "user", params: { id: "99" } });
    expect(router.current.peek().path).toBe("/users/99");
    expect(router.current.peek().name).toBe("user");
  });
});

describe("F4.3 alias", () => {
  it("alias 等价路径解析为同一 record", () => {
    const router = createRouter({
      mode: "memory",
      initialPath: "/old",
      routes: [{ path: "/new", alias: ["/old", "/legacy"], component: "new" }]
    });
    expect(router.current.peek().record?.component).toBe("new");
  });

  it("alias 数组多个", async () => {
    const router = createRouter({
      mode: "memory",
      routes: [{ path: "/canonical", alias: ["/a", "/b"], component: "c" }]
    });
    await router.push("/a");
    expect(router.current.peek().record?.component).toBe("c");
    await router.push("/b");
    expect(router.current.peek().record?.component).toBe("c");
  });
});

describe("F4.4 scrollBehavior", () => {
  it("导航后调用 scrollBehavior", async () => {
    const sb = vi.fn(() => null);
    const router = createRouter({
      mode: "memory",
      routes: [{ path: "/x", component: "x" }],
      scrollBehavior: sb
    });
    await router.push("/x");
    expect(sb).toHaveBeenCalledTimes(1);
  });
});

describe("F4.5 RouteMeta", () => {
  it("meta 字段透传到 RouteLocation", () => {
    const router = createRouter({
      mode: "memory",
      initialPath: "/x",
      routes: [{ path: "/x", component: "x", meta: { requiresAuth: true } }]
    });
    expect(router.current.peek().meta.requiresAuth).toBe(true);
  });
});

describe("F4.6 addRoute / removeRoute / hasRoute / getRoutes", () => {
  it("addRoute 动态添加", async () => {
    const router = createRouter({
      mode: "memory",
      routes: [{ path: "/", component: "home" }]
    });
    router.addRoute({ path: "/dynamic", name: "d", component: "dyn" });
    expect(router.hasRoute("d")).toBe(true);
    await router.push("/dynamic");
    expect(router.current.peek().record?.component).toBe("dyn");
  });

  it("addRoute 嵌套到父", async () => {
    const router = createRouter({
      mode: "memory",
      routes: [{ path: "/parent", name: "parent", component: "p" }]
    });
    router.addRoute("parent", { path: "child", component: "c" });
    await router.push("/parent/child");
    expect(router.current.peek().record?.component).toBe("c");
    expect(router.current.peek().matched.length).toBe(2);
  });

  it("addRoute 父路由缺失时输出结构化 warning", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const router = createRouter({
      mode: "memory",
      routes: [{ path: "/", component: "home" }]
    });

    router.addRoute("missing-parent", { path: "child", component: "c" });

    const output = spy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("ELF_ROUTER_ADD_ROUTE_PARENT_MISSING");
    expect(output).toContain("missing-parent");
  });

  it("命名路由缺失时输出结构化 warning", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const router = createRouter({
      mode: "memory",
      routes: [{ path: "/", component: "home" }]
    });

    expect(router.resolve({ name: "missing-route" }).fullPath).toBe("/");

    const output = spy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("ELF_ROUTER_NAMED_ROUTE_MISSING");
    expect(output).toContain("missing-route");
  });

  it("removeRoute 删除", () => {
    const router = createRouter({
      mode: "memory",
      routes: [{ path: "/x", name: "X", component: "x" }]
    });
    expect(router.hasRoute("X")).toBe(true);
    router.removeRoute("X");
    expect(router.hasRoute("X")).toBe(false);
  });

  it("同名 addRoute 会替换旧记录，clearRoutes 会清空 matcher", () => {
    const router = createRouter({
      mode: "memory",
      routes: [{ path: "/old", name: "page", component: "old" }]
    });
    router.addRoute({ path: "/new", name: "page", component: "new" });

    expect(router.resolve("/old").record).toBeNull();
    expect(router.resolve("/new").record?.component).toBe("new");
    router.clearRoutes();
    expect(router.getRoutes()).toEqual([]);
  });

  it("getRoutes 返回所有", () => {
    const router = createRouter({
      mode: "memory",
      routes: [
        {
          path: "/",
          name: "root",
          component: "r",
          children: [{ path: "child", name: "c", component: "ch" }]
        }
      ]
    });
    const all = router.getRoutes();
    expect(all.length).toBe(2);
    expect(all.map((r) => r.name)).toEqual(["root", "c"]);
  });

  it("isReady 在初次解析后 resolve", async () => {
    const router = createRouter({
      mode: "memory",
      routes: [{ path: "/", component: "h" }]
    });
    await router.isReady();
  });
});
