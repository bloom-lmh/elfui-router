import { afterEach, describe, expect, it } from "vitest";

import { defineCustomElement } from "@elfui/runtime";

import {
  createRouter,
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
  registerRouterElements,
  setActiveRouter
} from "../index";

const tick = (): Promise<void> => new Promise((resolve) => queueMicrotask(resolve));
const tag = (name: string): string => `router-guard-${name}-${Math.random().toString(36).slice(2, 8)}`;

afterEach(() => {
  document.body.innerHTML = "";
  setActiveRouter(null);
});

describe("component guard ordering", () => {
  it("runs nested leave guards deepest-first before global beforeEach", async () => {
    const order: string[] = [];
    const parent = tag("parent");
    const child = tag("child");
    defineCustomElement({
      tag: parent,
      setup() {
        onBeforeRouteLeave(() => {
          order.push("parent-leave");
        });
        return {};
      },
      render() {
        return document.createElement("section");
      }
    });
    defineCustomElement({
      tag: child,
      setup() {
        onBeforeRouteLeave(() => {
          order.push("child-leave");
        });
        return {};
      },
      render() {
        return document.createElement("article");
      }
    });
    const router = createRouter({
      mode: "memory",
      initialPath: "/parent/child",
      routes: [
        {
          path: "/parent",
          component: parent,
          children: [{ path: "child", component: child }]
        },
        { path: "/next", component: "main" }
      ]
    });
    router.beforeEach(() => {
      order.push("global");
    });
    setActiveRouter(router);
    registerRouterElements();
    const parentView = document.createElement("elf-router-view");
    const childView = document.createElement("elf-router-view");
    childView.setAttribute("depth", "1");
    document.body.append(parentView, childView);
    await tick();
    order.length = 0;

    await router.push("/next");

    expect(order).toEqual(["child-leave", "parent-leave", "global"]);
  });

  it("runs component update guards after global beforeEach", async () => {
    const order: string[] = [];
    const page = tag("update");
    defineCustomElement({
      tag: page,
      setup() {
        onBeforeRouteUpdate(() => {
          order.push("update");
        });
        return {};
      },
      render() {
        return document.createElement("main");
      }
    });
    const router = createRouter({
      mode: "memory",
      initialPath: "/users/1",
      routes: [{ path: "/users/:id", component: page }]
    });
    router.beforeEach(() => {
      order.push("global");
    });
    setActiveRouter(router);
    registerRouterElements();
    document.body.appendChild(document.createElement("elf-router-view"));
    await tick();
    order.length = 0;

    await router.push("/users/2");

    expect(order).toEqual(["global", "update"]);
  });
});
