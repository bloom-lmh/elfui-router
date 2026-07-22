// F1/F5 路由验收测试

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { defineCustomElement, useRef, type Ref, type RenderContext } from "@elfui/core";
import { setScopedSlot, text } from "@elfui/core/internal";

import {
  createRouter,
  onBeforeRouteLeave,
  registerRouterElements,
  setActiveRouter,
  useLink,
  type Router,
  type RouterViewSlotScope
} from "../index";

beforeEach(() => {
  // 重置 hash
  if (typeof window !== "undefined") {
    window.location.hash = "";
  }
});

afterEach(() => {
  document.body.innerHTML = "";
});

const tick = (): Promise<void> => new Promise((r) => queueMicrotask(r));
const testTag = (name: string): string =>
  `router-test-${name}-${Math.random().toString(36).slice(2, 7)}`;

describe("F1.1 createRouter & 解析", () => {
  it("初始路径解析", () => {
    const router = createRouter({
      mode: "memory",
      initialPath: "/",
      routes: [{ path: "/", component: "home-page" }]
    });
    expect(router.current.peek().path).toBe("/");
    expect(router.current.peek().record?.component).toBe("home-page");
  });

  it("路径不匹配时 record=null", () => {
    const router = createRouter({
      mode: "memory",
      initialPath: "/no-match",
      routes: [{ path: "/", component: "x" }]
    });
    expect(router.current.peek().record).toBeNull();
  });
});

describe("F1.4 动态参数", () => {
  it("/users/:id 解析", () => {
    const router = createRouter({
      mode: "memory",
      initialPath: "/users/42",
      routes: [{ path: "/users/:id", component: "user-page" }]
    });
    expect(router.current.peek().params.id).toBe("42");
  });

  it("多个参数", () => {
    const router = createRouter({
      mode: "memory",
      initialPath: "/posts/2024/hello",
      routes: [{ path: "/posts/:year/:slug", component: "post" }]
    });
    expect(router.current.peek().params).toEqual({ year: "2024", slug: "hello" });
  });

  it("可选参数 / 重复参数 / catch-all", () => {
    const optional = createRouter({
      mode: "memory",
      initialPath: "/users",
      routes: [{ path: "/users/:id?", component: "user-page" }]
    });
    expect(optional.current.peek().params.id).toBeUndefined();

    const repeat = createRouter({
      mode: "memory",
      initialPath: "/docs/a/b/c",
      routes: [{ path: "/docs/:parts+", component: "docs-page" }]
    });
    expect(repeat.current.peek().params.parts).toEqual(["a", "b", "c"]);

    const catchAll = createRouter({
      mode: "memory",
      initialPath: "/files/a/b/c",
      routes: [{ path: "/files/:pathMatch(.*)*", component: "files-page" }]
    });
    expect(catchAll.current.peek().params.pathMatch).toEqual(["a", "b", "c"]);
  });

  it("命名路由 stringify 支持数组参数", () => {
    const router = createRouter({
      mode: "memory",
      routes: [{ path: "/docs/:parts+", name: "docs", component: "docs-page" }]
    });
    expect(router.resolve({ name: "docs", params: { parts: ["a", "b"] } }).path).toBe("/docs/a/b");
  });
});

describe("F1.5 query / hash", () => {
  it("query 解析", () => {
    const router = createRouter({
      mode: "memory",
      initialPath: "/search?q=foo&page=2",
      routes: [{ path: "/search", component: "x" }]
    });
    expect(router.current.peek().query).toEqual({ q: "foo", page: "2" });
  });

  it("query 多值", () => {
    const router = createRouter({
      mode: "memory",
      initialPath: "/?tag=a&tag=b&tag=c",
      routes: [{ path: "/", component: "x" }]
    });
    expect(router.current.peek().query.tag).toEqual(["a", "b", "c"]);
  });

  it("hash 解析", () => {
    const router = createRouter({
      mode: "memory",
      initialPath: "/page#section",
      routes: [{ path: "/page", component: "x" }]
    });
    expect(router.current.peek().hash).toBe("#section");
  });
});

describe("F1.1 push / replace", () => {
  it("push 切换路径", async () => {
    const router = createRouter({
      mode: "memory",
      routes: [
        { path: "/", component: "home" },
        { path: "/about", component: "about" }
      ]
    });
    await router.push("/about");
    expect(router.current.peek().path).toBe("/about");
    expect(router.current.peek().record?.component).toBe("about");
  });

  it("redirect", async () => {
    const router = createRouter({
      mode: "memory",
      routes: [
        { path: "/old", redirect: "/new" },
        { path: "/new", component: "new-page" }
      ]
    });
    await router.push("/old");
    expect(router.current.peek().path).toBe("/new");
  });
});

describe("F3.1 守卫", () => {
  it("beforeEach 返回 false 阻止导航", async () => {
    const router = createRouter({
      mode: "memory",
      routes: [
        { path: "/", component: "home" },
        { path: "/admin", component: "admin", meta: { requiresAuth: true } }
      ]
    });
    router.beforeEach((to) => {
      if (to.record?.meta?.requiresAuth) return false;
    });
    await router.push("/admin");
    expect(router.current.peek().path).toBe("/");
  });

  it("beforeEach 返回字符串重定向", async () => {
    const router = createRouter({
      mode: "memory",
      routes: [
        { path: "/", component: "home" },
        { path: "/admin", component: "admin" },
        { path: "/login", component: "login" }
      ]
    });
    router.beforeEach((to) => {
      if (to.path === "/admin") return "/login";
    });
    await router.push("/admin");
    expect(router.current.peek().path).toBe("/login");
  });

  it("afterEach 在导航后调用", async () => {
    const router = createRouter({
      mode: "memory",
      routes: [{ path: "/x", component: "x" }]
    });
    const spy = vi.fn();
    router.afterEach(spy);
    await router.push("/x");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("F5 Composable useLink", () => {
  let router: Router;
  beforeEach(() => {
    router = createRouter({
      mode: "memory",
      routes: [
        { path: "/", component: "home" },
        { path: "/about", component: "about" }
      ]
    });
    setActiveRouter(router);
  });

  it("useLink 返回 href / navigate", () => {
    const link = useLink("/about");
    expect(link.href).toBe("/about");
    expect(typeof link.navigate).toBe("function");
  });

  it("hash 模式 href 加 #", () => {
    const r2 = createRouter({
      mode: "hash",
      routes: [{ path: "/foo", component: "x" }]
    });
    setActiveRouter(r2);
    const link = useLink("/foo");
    expect(link.href).toBe("#/foo");
    setActiveRouter(router);
  });

  it("useLink 支持命名路由", () => {
    const r2 = createRouter({
      mode: "memory",
      routes: [{ path: "/users/:id", name: "user", component: "x" }]
    });
    setActiveRouter(r2);
    const link = useLink({ name: "user", params: { id: 7 } });
    expect(link.href).toBe("/users/7");
    setActiveRouter(router);
  });

  it("useLink 支持 { to, replace } 选项形式", async () => {
    const link = useLink({ to: "/about", replace: true });
    await link.navigate();

    expect(router.current.peek().path).toBe("/about");
  });
});

describe("F1.3 elf-link / elf-router-view 元素", () => {
  it("registerRouterElements 注册标签", () => {
    registerRouterElements();
    expect(customElements.get("elf-link")).toBeDefined();
    expect(customElements.get("elf-router-view")).toBeDefined();
  });

  it("elf-router-view 渲染 record.component", async () => {
    const router = createRouter({
      mode: "memory",
      routes: [{ path: "/", component: "p" }]
    });
    setActiveRouter(router);
    registerRouterElements();
    const view = document.createElement("elf-router-view");
    document.body.appendChild(view);
    await tick();
    expect(view.querySelector("p")).toBeTruthy();
  });

  it("elf-router-view 渲染未注册的组件构造器时会按需注册", async () => {
    const pageTag = testTag("lazy-ctor");
    const Page = defineCustomElement(
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
      routes: [{ path: "/", component: Page }]
    });
    setActiveRouter(router);
    registerRouterElements();

    const view = document.createElement("elf-router-view");
    document.body.appendChild(view);
    await tick();

    expect(customElements.get(pageTag)).toBe(Page);
    expect(view.querySelector(pageTag)).toBeTruthy();
  });

  it("elf-router-view 支持 named views", async () => {
    const router = createRouter({
      mode: "memory",
      routes: [{ path: "/", components: { default: "main", aside: "aside" } }]
    });
    setActiveRouter(router);
    registerRouterElements();

    const main = document.createElement("elf-router-view");
    const aside = document.createElement("elf-router-view");
    aside.setAttribute("name", "aside");
    document.body.append(main, aside);
    await tick();

    expect(main.querySelector("main")).toBeTruthy();
    expect(aside.querySelector("aside")).toBeTruthy();
  });

  it("named views 可分别接收 props", async () => {
    const mainTag = testTag("named-main-props");
    const asideTag = testTag("named-aside-props");
    class MainPage extends HTMLElement {
      label = "";
    }
    class AsidePage extends HTMLElement {
      label = "";
    }
    customElements.define(mainTag, MainPage);
    customElements.define(asideTag, AsidePage);
    const router = createRouter({
      mode: "memory",
      routes: [
        {
          path: "/",
          components: { default: mainTag, aside: asideTag },
          props: { default: { label: "main" }, aside: { label: "aside" } }
        }
      ]
    });
    setActiveRouter(router);
    registerRouterElements();
    const main = document.createElement("elf-router-view");
    const aside = document.createElement("elf-router-view");
    aside.setAttribute("name", "aside");
    document.body.append(main, aside);
    await tick();

    expect((main.querySelector(mainTag) as MainPage).label).toBe("main");
    expect((aside.querySelector(asideTag) as AsidePage).label).toBe("aside");
  });

  it("elf-router-view 支持 route props", async () => {
    const tag = testTag("props");
    class PropPage extends HTMLElement {
      id = "";
    }
    customElements.define(tag, PropPage);
    const router = createRouter({
      mode: "memory",
      initialPath: "/users/42",
      routes: [{ path: "/users/:id", component: tag, props: true }]
    });
    setActiveRouter(router);
    registerRouterElements();

    const view = document.createElement("elf-router-view");
    document.body.appendChild(view);
    await tick();

    expect((view.querySelector(tag) as PropPage).id).toBe("42");
  });

  it("elf-router-view default scoped slot 暴露 Component / route / props", async () => {
    const router = createRouter({
      mode: "memory",
      initialPath: "/users/42",
      routes: [{ path: "/users/:id", component: "article", props: true }]
    });
    setActiveRouter(router);
    registerRouterElements();

    const view = document.createElement("elf-router-view");
    const scopes: RouterViewSlotScope[] = [];
    setScopedSlot<RouterViewSlotScope>(view, "default", (scope) => {
      scopes.push(scope);
      const shell = document.createElement("section");
      shell.dataset.component = String(scope.Component);
      shell.dataset.id = String(scope.route.params.id);
      shell.dataset.propId = String(scope.props.id);
      return shell;
    });
    document.body.appendChild(view);
    await tick();

    const shell = view.querySelector("section")!;
    expect(view.querySelector("article")).toBeNull();
    expect(shell.dataset.component).toBe("article");
    expect(shell.dataset.id).toBe("42");
    expect(shell.dataset.propId).toBe("42");
    expect(scopes[0]?.record.path).toBe("/users/:id");
  });

  it("onBeforeRouteLeave 可阻止离开当前组件路由", async () => {
    const tag = testTag("leave");
    defineCustomElement({
      tag,
      setup() {
        onBeforeRouteLeave(() => false);
        return {};
      },
      render() {
        return document.createElement("span");
      }
    });

    const router = createRouter({
      mode: "memory",
      initialPath: "/guarded",
      routes: [
        { path: "/guarded", component: tag },
        { path: "/next", component: "next-page" }
      ]
    });
    setActiveRouter(router);
    registerRouterElements();

    const view = document.createElement("elf-router-view");
    document.body.appendChild(view);
    await tick();

    await router.push("/next");
    expect(router.current.peek().path).toBe("/guarded");
  });

  it("router-view 不会订阅并重建路由组件内部 state", async () => {
    const pageTag = testTag("stateful");
    let disconnected = 0;

    defineCustomElement({
      tag: pageTag,
      setup: () => ({ count: useRef(0) }),
      render(ctx: RenderContext) {
        const count = ctx.state.count as Ref<number>;
        const button = document.createElement("button");
        const label = document.createTextNode("");
        button.appendChild(label);
        text(label, () => count.value);
        button.addEventListener("click", () => count.set(count.peek() + 1));
        return button;
      }
    });

    const Ctor = customElements.get(pageTag)!;
    const originalDisconnected = Ctor.prototype.disconnectedCallback;
    Ctor.prototype.disconnectedCallback = function disconnectedCallback(this: HTMLElement) {
      disconnected++;
      originalDisconnected?.call(this);
    };

    const router = createRouter({
      mode: "memory",
      routes: [{ path: "/", component: pageTag }]
    });
    setActiveRouter(router);
    registerRouterElements();

    const view = document.createElement("elf-router-view");
    document.body.appendChild(view);
    await tick();

    const first = view.querySelector(pageTag) as HTMLElement;
    expect(first).toBeTruthy();

    first
      .shadowRoot!.querySelector("button")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await tick();

    expect(first.shadowRoot!.querySelector("button")!.textContent).toBe("1");
    expect(view.querySelector(pageTag)).toBe(first);
    expect(disconnected).toBe(0);
  });
});
