# astro-suspense

Out of order streaming support for [Astro](https://astro.build).

> :warning: This is little more than a proof of concept at this point. Use it if you dare, but know that I'm not (yet) using it in production myself.

## Demo

[See a demo](https://astro-suspense.cwh.gg/).

## Installation

```bash
npx astro add astro-suspense
```

## Usage

```astro
---
import { Suspense } from "astro-suspense/components";
import SlowComponent from "./SlowComponent";
---

<Suspense>
  <SlowComponent />
</Suspense>
```

For view transitions you need to replace Astro's default `<ViewTransitions />` with this package's `<SuspenseViewTransitions />`.

```astro
---
import { SuspenseViewTransitions } from "astro-suspense/components";
---

<!doctype html>
<html>
  <head>
    <SuspenseViewTransitions />
  </head>
  <body> </body>
</html>
```
