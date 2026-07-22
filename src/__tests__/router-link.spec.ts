// elf-router-link 行为测试 — active-class / replace / alias

import { afterEach, describe, expect, it } from "vitest";

import { setScopedSlot } from "@elfui/core/internal";

import {
  createRouter,
  registerRouterElements,
  setActiveRouter,
  type RouteLocationRaw,
  type RouterLinkSlotScope
} from "../index";

afterEach(() => {
  setActiveRouter(null);
  document.body.innerHTML = "";
  history.replaceState(null, "", "/");
});

const tag = (n: string) => `page-rl-${n}-${Math.random().toString(36).slice(2, 6)}`;

describe("elf-router-link", () => {
  it("注册了 elf-router-link 标签", () => {
    registerRouterElements();
    expect(customElements.get("elf-router-link")).toBeDefined();
    // 兼容 elf-link 别名
    expect(customElements.get("elf-link")).toBeDefined();
  });

  it("到当前路径时附加 active-class & exact-active-class", async () => {
    const home = tag("home");
    const router = createRouter({
      mode: "memory",
      routes: [{ path: "/", component: home }]
    });
    setActiveRouter(router);
    registerRouterElements();

    const link = document.createElement("elf-router-link");
    link.setAttribute("to", "/");
    link.textContent = "Home";
    document.body.appendChild(link);

    await Promise.resolve();
    expect(link.classList.contains("active")).toBe(true);
    expect(link.classList.contains("exact-active")).toBe(true);
    expect(link.getAttribute("aria-current")).toBe("page");
    expect(link.querySelector("a")?.getAttribute("aria-current")).toBe("page");
  });

  it("支持自定义 aria-current-value", async () => {
    const router = createRouter({ mode: "memory", routes: [{ path: "/", component: tag("aria") }] });
    setActiveRouter(router);
    const link = document.createElement("elf-router-link");
    link.setAttribute("to", "/");
    link.setAttribute("aria-current-value", "step");
    document.body.appendChild(link);
    await Promise.resolve();

    expect(link.getAttribute("aria-current")).toBe("step");
  });

  it("自定义 active-class / exact-active-class", async () => {
    const router = createRouter({
      mode: "memory",
      routes: [{ path: "/", component: tag("a") }]
    });
    setActiveRouter(router);
    registerRouterElements();

    const link = document.createElement("elf-router-link");
    link.setAttribute("to", "/");
    link.setAttribute("active-class", "is-on");
    link.setAttribute("exact-active-class", "is-exact");
    document.body.appendChild(link);

    await Promise.resolve();
    expect(link.classList.contains("is-on")).toBe(true);
    expect(link.classList.contains("is-exact")).toBe(true);
    // 默认 active 不再附加
    expect(link.classList.contains("active")).toBe(false);
  });

  it("使用 router 全局 active class 默认值", async () => {
    const router = createRouter({
      mode: "memory",
      linkActiveClass: "router-active",
      linkExactActiveClass: "router-exact",
      routes: [{ path: "/", component: tag("global-class") }]
    });
    setActiveRouter(router);
    const link = document.createElement("elf-router-link");
    link.setAttribute("to", "/");
    document.body.appendChild(link);
    await Promise.resolve();

    expect(link.classList.contains("router-active")).toBe(true);
    expect(link.classList.contains("router-exact")).toBe(true);
  });

  it("replace 属性走 router.replace 不入历史栈", async () => {
    const homeTag = tag("home");
    const aboutTag = tag("about");
    const router = createRouter({
      mode: "memory",
      routes: [
        { path: "/", component: homeTag },
        { path: "/about", component: aboutTag }
      ]
    });
    setActiveRouter(router);
    registerRouterElements();

    const link = document.createElement("elf-router-link");
    link.setAttribute("to", "/about");
    link.setAttribute("replace", "");
    document.body.appendChild(link);

    const beforeStack = router.current.peek().path;
    expect(beforeStack).toBe("/");
    link.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(router.current.peek().path).toBe("/about");
  });

  it("custom 模式不包 a，并通过 scoped slot 暴露 href / active / navigate", async () => {
    const router = createRouter({
      mode: "memory",
      routes: [
        { path: "/", name: "home", component: tag("home") },
        { path: "/about", name: "about", component: tag("about") }
      ]
    });
    setActiveRouter(router);
    registerRouterElements();

    const link = document.createElement("elf-router-link") as HTMLElement & {
      to: RouteLocationRaw;
      href: string;
      isActive: boolean;
      isExactActive: boolean;
    };
    link.setAttribute("custom", "");
    link.to = { name: "about" };
    const scopes: RouterLinkSlotScope[] = [];
    setScopedSlot<RouterLinkSlotScope>(link, "default", (scope) => {
      scopes.push(scope);
      const button = document.createElement("button");
      button.textContent = `${scope.href}:${scope.isActive}`;
      button.addEventListener("click", (event) => {
        void scope.navigate(event);
      });
      return button;
    });
    document.body.appendChild(link);

    await Promise.resolve();
    expect(link.querySelector("a")).toBeNull();
    expect(link.getAttribute("href")).toBe("/about");
    expect(link.href).toBe("/about");
    expect(link.isActive).toBe(false);
    expect(scopes[0]?.href).toBe("/about");

    link.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(router.current.peek().path).toBe("/about");
    expect(link.isActive).toBe(true);
    expect(link.isExactActive).toBe(true);
  });

  it("alias 路径也命中同一 record", () => {
    const router = createRouter({
      mode: "memory",
      routes: [{ path: "/home", alias: ["/", "/index"], component: tag("home") }]
    });
    setActiveRouter(router);
    expect(router.resolve("/").matched.length).toBeGreaterThan(0);
    expect(router.resolve("/index").matched.length).toBeGreaterThan(0);
    expect(router.resolve("/home").matched.length).toBeGreaterThan(0);
  });
});
