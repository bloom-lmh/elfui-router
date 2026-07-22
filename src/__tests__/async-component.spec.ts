// F3.3 异步路由组件 验收测试

import { afterEach, describe, expect, it, vi } from "vitest";

import { defineCustomElement } from "@elfui/core";
import { createRouter, registerRouterElements, setActiveRouter } from "../index";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

const tick = (): Promise<void> => new Promise((r) => queueMicrotask(r));
const testTag = (name: string): string =>
  `router-async-${name}-${Math.random().toString(36).slice(2, 7)}`;

describe("F3.3 异步路由组件", () => {
  it("函数 component 异步加载 default 导出（标签名）", async () => {
    const router = createRouter({
      mode: "memory",
      initialPath: "/lazy",
      routes: [
        {
          path: "/lazy",
          component: () => Promise.resolve({ default: "p" })
        }
      ]
    });
    setActiveRouter(router);
    registerRouterElements();

    const view = document.createElement("elf-router-view");
    document.body.appendChild(view);
    // 异步加载需要等下一轮 microtask
    await tick();
    await tick();
    expect(view.querySelector("p")).toBeTruthy();
  });

  it("函数 component 也能直接返回字符串（无 default）", async () => {
    const router = createRouter({
      mode: "memory",
      initialPath: "/x",
      routes: [
        {
          path: "/x",
          // 直接返回字符串（虚拟模块）
          component: () => Promise.resolve("span")
        }
      ]
    });
    setActiveRouter(router);
    registerRouterElements();

    const view = document.createElement("elf-router-view");
    document.body.appendChild(view);
    await tick();
    await tick();
    expect(view.querySelector("span")).toBeTruthy();
  });

  it("函数 component 能自动使用模块里的唯一命名宏组件导出", async () => {
    const pageTag = testTag("named");
    const PageNamed = defineCustomElement(
      {
        tag: pageTag,
        render() {
          return document.createElement("main");
        }
      },
      { register: false }
    );
    expect(customElements.get(pageTag)).toBeUndefined();

    const router = createRouter({
      mode: "memory",
      initialPath: "/named",
      routes: [
        {
          path: "/named",
          component: () => Promise.resolve({ PageNamed })
        }
      ]
    });
    setActiveRouter(router);
    registerRouterElements();

    const view = document.createElement("elf-router-view");
    document.body.appendChild(view);
    await tick();
    await tick();

    expect(customElements.get(pageTag)).toBe(PageNamed);
    expect(view.querySelector(pageTag)).toBeTruthy();
  });

  it("函数 component 模块没有组件导出时给出导出名诊断", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const router = createRouter({
      mode: "memory",
      initialPath: "/missing",
      routes: [
        {
          path: "/missing",
          component: () => Promise.resolve({ helper: () => null, setupData: 1 })
        }
      ]
    });
    setActiveRouter(router);
    registerRouterElements();

    const view = document.createElement("elf-router-view");
    document.body.appendChild(view);
    await tick();
    await tick();

    const output = spy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("ELF_ROUTER_ASYNC_COMPONENT_MISSING");
    expect(output).toContain("模块导出名");
    expect(output).toContain("helper");
    expect(output).toContain("setupData");
    expect(output).toContain("default");
    expect(view.children.length).toBe(0);
  });

  it("异步加载失败不崩溃", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const router = createRouter({
      mode: "memory",
      initialPath: "/fail",
      routes: [
        {
          path: "/fail",
          component: () => Promise.reject(new Error("load failed"))
        }
      ]
    });
    setActiveRouter(router);
    registerRouterElements();

    const view = document.createElement("elf-router-view");
    document.body.appendChild(view);
    await tick();
    await tick();
    // 加载失败时不渲染任何内容（错误已被 console.error 打印）
    const output = spy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("ELF_ROUTER_ASYNC_COMPONENT_LOAD");
    expect(output).toContain("/fail");
    expect(view.children.length).toBe(0);
  });
});
