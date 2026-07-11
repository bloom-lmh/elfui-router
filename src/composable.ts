// 路由 composables — useRouter / useRoute / useLink

import { useEffect, useRef } from "@elfui/reactivity";
import { onUnmount } from "@elfui/runtime";

import {
  getActiveRouter,
  type NavigationGuard,
  type RouteLocation,
  type RouteLocationRaw,
  type Router
} from "./router";

/** 在 setup 内拿到当前 Router */
export const useRouter = (): Router | null => getActiveRouter();

/** 在 setup 内拿到当前激活的 RouteLocation（响应式 state） */
export const useRoute = (): RouteLocation => {
  const r = getActiveRouter();
  if (!r) {
    if (__DEV__) {
      console.warn(
        "[elf-router]\n[ELF_ROUTER_NO_ACTIVE_ROUTER] WARNING useRoute\n  没有激活的 router。\n  hint: 请先调用 createRouter(...)，或显式 setActiveRouter(router)。"
      );
    }
    return {
      fullPath: "/",
      path: "/",
      record: null,
      matched: [],
      params: {},
      query: {},
      hash: "",
      meta: {}
    };
  }
  return r.current.value;
};

export interface UseLinkResult {
  /** 当前 href（可填到 anchor 的 href 属性） */
  href: string;
  /** 是否激活 */
  isActive: boolean;
  /** 是否完全匹配 */
  isExactActive: boolean;
  /** 编程式跳转 */
  navigate: () => Promise<void>;
}

/** 给自定义 link 组件的 headless API */
export const useLink = (to: RouteLocationRaw): UseLinkResult => {
  const router = getActiveRouter();
  const isActiveState = useRef(false);
  const isExactState = useRef(false);
  const fallbackHref = typeof to === "string" ? to : "path" in to ? to.path : "/";
  const href = router ? router.resolve(to).fullPath : fallbackHref;

  if (router) {
    useEffect(() => {
      const cur = router.current.value.path;
      const target = router.resolve(to).path;
      isExactState.value = cur === target;
      isActiveState.value = cur === target || cur.startsWith(target + "/");
    });
  }

  return {
    href: router?.options.mode === "hash" ? `#${href}` : href,
    get isActive(): boolean {
      return isActiveState.value as boolean;
    },
    get isExactActive(): boolean {
      return isExactState.value as boolean;
    },
    navigate: async () => {
      if (!router) return;
      await router.push(to);
    }
  };
};

export const onBeforeRouteLeave = (guard: NavigationGuard): (() => void) => {
  const router = getActiveRouter();
  const record = router?.current.peek().record;
  if (!router || !record) return () => undefined;
  const dispose = router.beforeEach((to, from) => {
    if (from.matched.includes(record) && !to.matched.includes(record)) {
      return guard(to, from);
    }
    return undefined;
  });
  onUnmount(dispose);
  return dispose;
};

export const onBeforeRouteUpdate = (guard: NavigationGuard): (() => void) => {
  const router = getActiveRouter();
  const record = router?.current.peek().record;
  if (!router || !record) return () => undefined;
  const dispose = router.beforeEach((to, from) => {
    if (
      from.matched.includes(record) &&
      to.matched.includes(record) &&
      to.fullPath !== from.fullPath
    ) {
      return guard(to, from);
    }
    return undefined;
  });
  onUnmount(dispose);
  return dispose;
};
