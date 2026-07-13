# @elfui/router

Official router for ElfUI applications.

```bash
pnpm add @elfui/router
```

```ts
import { createRouter, createWebHistory } from "@elfui/router";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: "home-page" },
    { path: "/users/:id", name: "user", component: () => import("./pages/User") }
  ]
});
```

`createWebHistory()`, `createWebHashHistory()`, and `createMemoryHistory()` mirror Vue Router's
history selection API. The existing `{ mode: "history" | "hash" | "memory" }` option remains
supported for ElfUI applications.

```html
<elf-link to="/">Home</elf-link>
<elf-link :to=${{ name: "user", params: { id: 42 } }}>Profile</elf-link>
<elf-router-view></elf-router-view>
```

Highlights:

- Nested routes, aliases, redirects, named routes, named views, and route props.
- Route ranking, custom parameter regexes, optional/repeatable params, and normalized query values.
- Global, route, and component leave/update guards; lazy route components load before `beforeResolve`.
- Navigation failures, history traversal, base-aware `href`s, and scroll restoration.
