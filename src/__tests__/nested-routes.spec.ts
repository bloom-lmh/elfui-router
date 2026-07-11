// F2 嵌套路由 验收测试

import { afterEach, describe, expect, it } from "vitest";

import { createRouter, registerRouterElements, setActiveRouter } from "../index";

afterEach(() => {
  document.body.innerHTML = "";
});

const tick = (): Promise<void> => new Promise((r) => queueMicrotask(r));

describe("F2.1 children 配置", () => {
  it("匹配嵌套路径", () => {
    const router = createRouter({
      mode: "memory",
      initialPath: "/user/42/profile",
      routes: [
        {
          path: "/user/:id",
          component: "user-layout",
          children: [
            { path: "profile", component: "user-profile" },
            { path: "posts", component: "user-posts" }
          ]
        }
      ]
    });
    const cur = router.current.peek();
    expect(cur.record?.component).toBe("user-profile");
    expect(cur.params.id).toBe("42");
    // matched 链：root -> child
    expect(cur.matched.length).toBe(2);
    expect(cur.matched[0]?.component).toBe("user-layout");
    expect(cur.matched[1]?.component).toBe("user-profile");
  });

  it("根级匹配（无子路由）也工作", () => {
    const router = createRouter({
      mode: "memory",
      initialPath: "/user/42",
      routes: [
        {
          path: "/user/:id",
          component: "user-layout",
          children: [{ path: "profile", component: "user-profile" }]
        }
      ]
    });
    const cur = router.current.peek();
    // /user/42 命中父路由
    expect(cur.record?.component).toBe("user-layout");
    expect(cur.matched.length).toBe(1);
  });
});

describe("F2.3 默认子路由", () => {
  it('children: [{ path: "" }] 当作默认子路由', () => {
    const router = createRouter({
      mode: "memory",
      initialPath: "/user/42",
      routes: [
        {
          path: "/user/:id",
          component: "user-layout",
          children: [
            { path: "", component: "user-default" },
            { path: "profile", component: "user-profile" }
          ]
        }
      ]
    });
    const cur = router.current.peek();
    expect(cur.record?.component).toBe("user-default");
    expect(cur.matched.length).toBe(2);
  });
});

describe("F2.2 多级 elf-router-view depth", () => {
  it("depth=0 渲染父，depth=1 渲染子", async () => {
    const router = createRouter({
      mode: "memory",
      initialPath: "/user/42/profile",
      routes: [
        {
          path: "/user/:id",
          component: "p",
          children: [{ path: "profile", component: "span" }]
        }
      ]
    });
    setActiveRouter(router);
    registerRouterElements();

    const root = document.createElement("div");
    document.body.appendChild(root);
    const view0 = document.createElement("elf-router-view");
    view0.setAttribute("depth", "0");
    root.appendChild(view0);

    const view1 = document.createElement("elf-router-view");
    view1.setAttribute("depth", "1");
    root.appendChild(view1);
    await tick();

    expect(view0.querySelector("p")).toBeTruthy();
    expect(view1.querySelector("span")).toBeTruthy();
  });
});
