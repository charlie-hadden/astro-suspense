// This is a modified version of https://github.com/withastro/astro/blob/e63aac94ca8aca96a39785a2f5926827ed18c255/packages/astro/src/prefetch/index.ts

// MIT License
//
// Copyright (c) 2021 Fred K. Schott
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
//
//
// """
// This license applies to parts of the `packages/create-astro` and `packages/astro` subdirectories originating from the https://github.com/sveltejs/kit repository:
//
// Copyright (c) 2020 [these people](https://github.com/sveltejs/kit/graphs/contributors)
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
// """
//
//
// """
// This license applies to parts of the `packages/create-astro` and `packages/astro` subdirectories originating from the https://github.com/vitejs/vite repository:
//
// MIT License
//
// Copyright (c) 2019-present, Yuxi (Evan) You and Vite contributors
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
// """

/*
  NOTE: Do not add any dependencies or imports in this file so that it can load quickly in dev.
*/

// eslint-disable-next-line no-console
// @ts-expect-error import env
const debug = import.meta.env.DEV ? console.debug : undefined;
// @ts-expect-error import env

const inBrowser = import.meta.env.SSR === false;
// Track prefetched URLs so we don't prefetch twice
const prefetchedUrls = new Set<string>();
// Track listened anchors so we don't attach duplicated listeners
const listenedAnchors = new WeakSet<HTMLAnchorElement>();

// User-defined config for prefetch. The values are injected by vite-plugin-prefetch
// and can be undefined if not configured. But it will be set a fallback value in `init()`.
let prefetchAll: boolean;
let defaultStrategy: string;

interface InitOptions {
  defaultStrategy?: string;
  prefetchAll?: boolean;
}

let inited = false;
/**
 * Initialize the prefetch script, only works once.
 *
 * @param defaultOpts Default options for prefetching if not already set by the user config.
 */
export function init(defaultOpts?: InitOptions) {
  if (!inBrowser) return;

  // Init only once
  if (inited) return;
  inited = true;

  debug?.(`[astro] Initializing prefetch script`);

  // Fallback default values if not set by user config
  prefetchAll ??= defaultOpts?.prefetchAll ?? false;
  defaultStrategy ??= defaultOpts?.defaultStrategy ?? "hover";

  // In the future, perhaps we can enable treeshaking specific unused strategies
  initTapStrategy();
  initHoverStrategy();
  initViewportStrategy();
}

/**
 * Prefetch links with higher priority when the user taps on them
 */
function initTapStrategy() {
  for (const event of ["touchstart", "mousedown"]) {
    document.body.addEventListener(
      event,
      (e) => {
        if (elMatchesStrategy(e.target, "tap")) {
          prefetch(e.target.href, { with: "fetch" });
        }
      },
      { passive: true },
    );
  }
}

/**
 * Prefetch links with higher priority when the user hovers over them
 */
function initHoverStrategy() {
  let timeout: number;

  // Handle focus listeners
  document.body.addEventListener(
    "focusin",
    (e) => {
      if (elMatchesStrategy(e.target, "hover")) {
        handleHoverIn(e);
      }
    },
    { passive: true },
  );
  document.body.addEventListener("focusout", handleHoverOut, { passive: true });

  // Handle hover listeners. Re-run each time on page load.
  onPageLoad(() => {
    for (const anchor of document.getElementsByTagName("a")) {
      // Skip if already listening
      if (listenedAnchors.has(anchor)) continue;
      // Add listeners for anchors matching the strategy
      if (elMatchesStrategy(anchor, "hover")) {
        listenedAnchors.add(anchor);
        anchor.addEventListener("mouseenter", handleHoverIn, { passive: true });
        anchor.addEventListener("mouseleave", handleHoverOut, {
          passive: true,
        });
      }
    }
  });

  function handleHoverIn(e: Event) {
    const href = (e.target as HTMLAnchorElement).href;

    // Debounce hover prefetches by 80ms
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      prefetch(href, { with: "fetch" });
    }, 80) as unknown as number;
  }

  // Cancel prefetch if the user hovers away
  function handleHoverOut() {
    if (timeout) {
      clearTimeout(timeout);
      timeout = 0;
    }
  }
}

/**
 * Prefetch links with lower priority as they enter the viewport
 */
function initViewportStrategy() {
  let observer: IntersectionObserver;

  onPageLoad(() => {
    for (const anchor of document.getElementsByTagName("a")) {
      // Skip if already listening
      if (listenedAnchors.has(anchor)) continue;
      // Observe for anchors matching the strategy
      if (elMatchesStrategy(anchor, "viewport")) {
        listenedAnchors.add(anchor);
        observer ??= createViewportIntersectionObserver();
        observer.observe(anchor);
      }
    }
  });
}

function createViewportIntersectionObserver() {
  const timeouts = new WeakMap<HTMLAnchorElement, number>();

  return new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      const anchor = entry.target as HTMLAnchorElement;
      const timeout = timeouts.get(anchor);
      // Prefetch if intersecting
      if (entry.isIntersecting) {
        // Debounce viewport prefetches by 300ms
        if (timeout) {
          clearTimeout(timeout);
        }
        timeouts.set(
          anchor,
          setTimeout(() => {
            observer.unobserve(anchor);
            timeouts.delete(anchor);
            prefetch(anchor.href, { with: "link" });
          }, 300) as unknown as number,
        );
      } else {
        // If exited viewport but haven't prefetched, cancel it
        if (timeout) {
          clearTimeout(timeout);
          timeouts.delete(anchor);
        }
      }
    }
  });
}

export interface PrefetchOptions {
  /**
   * How the prefetch should prioritize the URL. (default `'link'`)
   * - `'link'`: use `<link rel="prefetch">`, has lower loading priority.
   * - `'fetch'`: use `fetch()`, has higher loading priority.
   */
  with?: "link" | "fetch";
}

/**
 * Prefetch a URL so it's cached when the user navigates to it.
 *
 * @param url A full or partial URL string based on the current `location.href`. They are only fetched if:
 *   - The user is online
 *   - The user is not in data saver mode
 *   - The URL is within the same origin
 *   - The URL is not the current page
 *   - The URL has not already been prefetched
 * @param opts Additional options for prefetching.
 */
export function prefetch(url: string, opts?: PrefetchOptions) {
  if (!canPrefetchUrl(url)) return;
  prefetchedUrls.add(url);

  const priority = opts?.with ?? "link";
  debug?.(`[astro] Prefetching ${url} with ${priority}`);

  if (priority === "link") {
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.setAttribute("href", url);
    document.head.append(link);
  } else {
    fetch(url, {
      headers: {
        "astro-suspense-transition": "1",
      },
    }).catch((e) => {
      // eslint-disable-next-line no-console
      console.log(`[astro] Failed to prefetch ${url}`);
      // eslint-disable-next-line no-console
      console.error(e);
    });
  }
}

function canPrefetchUrl(url: string) {
  // Skip prefetch if offline
  if (!navigator.onLine) return false;
  if ("connection" in navigator) {
    // Untyped Chrome-only feature: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/connection
    const conn = navigator.connection as any;
    // Skip prefetch if using data saver mode or slow connection
    if (conn.saveData || /(2|3)g/.test(conn.effectiveType)) return false;
  }
  // Else check if URL is within the same origin, not the current page, and not already prefetched
  try {
    const urlObj = new URL(url, location.href);
    return (
      location.origin === urlObj.origin &&
      location.pathname !== urlObj.pathname &&
      !prefetchedUrls.has(url)
    );
  } catch {
    // ...
  }
  return false;
}

function elMatchesStrategy(
  el: EventTarget | null,
  strategy: string,
): el is HTMLAnchorElement {
  // @ts-expect-error access unknown property this way as it's more performant
  if (el?.tagName !== "A") return false;
  const attrValue = (el as HTMLElement).dataset.astroPrefetch;

  // Out-out if `prefetchAll` is enabled
  if (attrValue === "false") {
    return false;
  }
  // If anchor has no dataset but we want to prefetch all, or has dataset but no value,
  // check against fallback default strategy
  if ((attrValue == null && prefetchAll) || attrValue === "") {
    return strategy === defaultStrategy;
  }
  // Else if dataset is explicitly defined, check against it
  if (attrValue === strategy) {
    return true;
  }
  // Else, no match
  return false;
}

/**
 * Listen to page loads and handle Astro's View Transition specific events
 */
function onPageLoad(cb: () => void) {
  cb();
  // Ignore first call of `astro-page-load` as we already call `cb` above.
  // We have to call `cb` eagerly as View Transitions may not be enabled.
  let firstLoad = false;
  document.addEventListener("astro:page-load", () => {
    if (!firstLoad) {
      firstLoad = true;
      return;
    }
    cb();
  });
}
