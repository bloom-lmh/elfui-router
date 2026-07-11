# @elfui/router

Official router for ElfUI applications.

```bash
pnpm add @elfui/router
```

```ts
import { createRouter } from "@elfui/router";

const router = createRouter({
  mode: "hash",
  routes: [{ path: "/", component: "home-page" }],
});
```
