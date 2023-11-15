// This is a modified version of https://github.com/withastro/astro/blob/e63aac94ca8aca96a39785a2f5926827ed18c255/packages/astro/src/transitions/router.ts

export type Fallback = "none" | "animate" | "swap";
export type Direction = "forward" | "back";
export type Options = {
  history?: "auto" | "push" | "replace";
  formData?: FormData;
};

type State = {
  index: number;
  scrollX: number;
  scrollY: number;
  intraPage?: boolean;
};
type Events = "astro:page-load" | "astro:after-swap";

// only update history entries that are managed by us
// leave other entries alone and do not accidently add state.
const updateScrollPosition = (positions: {
  scrollX: number;
  scrollY: number;
}) =>
  history.state && history.replaceState({ ...history.state, ...positions }, "");

// @ts-expect-error import env
const inBrowser = import.meta.env.SSR === false;

export const supportsViewTransitions =
  // @ts-expect-error view transition
  inBrowser && !!document.startViewTransition;

export const transitionEnabledOnThisPage = () =>
  inBrowser &&
  !!document.querySelector('[name="astro-view-transitions-enabled"]');

const samePage = (otherLocation: URL) =>
  location.pathname === otherLocation.pathname &&
  location.search === otherLocation.search;
const triggerEvent = (name: Events) => document.dispatchEvent(new Event(name));
const onPageLoad = () => triggerEvent("astro:page-load");
const announce = () => {
  const div = document.createElement("div");
  div.setAttribute("aria-live", "assertive");
  div.setAttribute("aria-atomic", "true");
  div.className = "astro-route-announcer";
  document.body.append(div);
  setTimeout(
    () => {
      const title =
        document.title ||
        document.querySelector("h1")?.textContent ||
        location.pathname;
      div.textContent = title;
    },
    // Much thought went into this magic number; the gist is that screen readers
    // need to see that the element changed and might not do so if it happens
    // too quickly.
    60,
  );
};

const PERSIST_ATTR = "data-astro-transition-persist";
const VITE_ID = "data-vite-dev-id";

let streamReader: ReadableStreamDefaultReader<string>;
let parser: DOMParser;

// The History API does not tell you if navigation is forward or back, so
// you can figure it using an index. On pushState the index is incremented so you
// can use that to determine popstate if going forward or back.
let currentHistoryIndex = 0;

if (inBrowser) {
  if (history.state) {
    // Here we reloaded a page with history state
    // (e.g. history navigation from non-transition page or browser reload)
    currentHistoryIndex = history.state.index;
    scrollTo({ left: history.state.scrollX, top: history.state.scrollY });
  } else if (transitionEnabledOnThisPage()) {
    // This page is loaded from the browser addressbar or via a link from extern,
    // it needs a state in the history
    history.replaceState(
      { index: currentHistoryIndex, scrollX, scrollY, intraPage: false },
      "",
    );
  }
}

const throttle = (cb: (...args: any[]) => any, delay: number) => {
  let wait = false;
  // During the waiting time additional events are lost.
  // So repeat the callback at the end if we have swallowed events.
  let onceMore = false;
  return (...args: any[]) => {
    if (wait) {
      onceMore = true;
      return;
    }
    cb(...args);
    wait = true;
    setTimeout(() => {
      if (onceMore) {
        onceMore = false;
        cb(...args);
      }
      wait = false;
    }, delay);
  };
};

// returns the contents of the page or null if the router can't deal with it.
async function fetchHTML(
  href: string,
  init?: RequestInit,
): Promise<
  | null
  | { html: string; redirected?: string; mediaType: DOMParserSupportedType }
  | {
      suspenseStream: AsyncGenerator<string>;
      redirected?: string;
      mediaType: "text/astro-suspense-transition-stream";
    }
> {
  try {
    const res = await fetch(href, init);
    // drop potential charset (+ other name/value pairs) as parser needs the mediaType
    const mediaType = res.headers.get("content-type")?.replace(/;.*$/, "");

    if (streamReader) streamReader.cancel();

    if (mediaType === "text/astro-suspense-transition-stream") {
      if (!res.body) return null;

      streamReader = res.body.pipeThrough(new TextDecoderStream()).getReader();

      return {
        suspenseStream: readSuspenseStream(),
        redirected: res.redirected ? res.url : undefined,
        mediaType,
      };
    }

    // the DOMParser can handle two types of HTML
    if (mediaType !== "text/html" && mediaType !== "application/xhtml+xml") {
      // everything else (e.g. audio/mp3) will be handled by the browser but not by us
      return null;
    }
    const html = await res.text();
    return {
      html,
      redirected: res.redirected ? res.url : undefined,
      mediaType,
    };
  } catch (err) {
    // can't fetch, let someone else deal with it.
    return null;
  }
}

function getFallback(): Fallback {
  const el = document.querySelector('[name="astro-view-transitions-fallback"]');
  if (el) {
    return el.getAttribute("content") as Fallback;
  }
  return "animate";
}

function runScripts() {
  let wait = Promise.resolve();
  for (const script of Array.from(document.scripts)) {
    if (script.dataset.astroExec === "") continue;
    const newScript = document.createElement("script");
    newScript.innerHTML = script.innerHTML;
    for (const attr of script.attributes) {
      if (attr.name === "src") {
        const p = new Promise((r) => {
          newScript.onload = r;
        });
        wait = wait.then(() => p as any);
      }
      newScript.setAttribute(attr.name, attr.value);
    }
    newScript.dataset.astroExec = "";
    script.replaceWith(newScript);
  }
  return wait;
}

function isInfinite(animation: Animation) {
  const effect = animation.effect;
  if (!effect || !(effect instanceof KeyframeEffect) || !effect.target)
    return false;
  const style = window.getComputedStyle(effect.target, effect.pseudoElement);
  return style.animationIterationCount === "infinite";
}

// Add a new entry to the browser history. This also sets the new page in the browser addressbar.
// Sets the scroll position according to the hash fragment of the new location.
const moveToLocation = (
  toLocation: URL,
  replace: boolean,
  intraPage: boolean,
) => {
  const fresh = !samePage(toLocation);
  let scrolledToTop = false;
  if (toLocation.href !== location.href) {
    if (replace) {
      history.replaceState({ ...history.state }, "", toLocation.href);
    } else {
      history.replaceState({ ...history.state, intraPage }, "");
      history.pushState(
        { index: ++currentHistoryIndex, scrollX: 0, scrollY: 0 },
        "",
        toLocation.href,
      );
    }
    // now we are on the new page for non-history navigations!
    // (with history navigation page change happens before popstate is fired)
    // freshly loaded pages start from the top
    if (fresh) {
      scrollTo({ left: 0, top: 0, behavior: "instant" });
      scrolledToTop = true;
    }
  }
  if (toLocation.hash) {
    // because we are already on the target page ...
    // ... what comes next is a intra-page navigation
    // that won't reload the page but instead scroll to the fragment
    location.href = toLocation.href;
  } else {
    if (!scrolledToTop) {
      scrollTo({ left: 0, top: 0, behavior: "instant" });
    }
  }
};

function stylePreloadLinks(newDocument: Document) {
  const links: Promise<any>[] = [];
  for (const el of newDocument.querySelectorAll("head link[rel=stylesheet]")) {
    // Do not preload links that are already on the page.
    if (
      !document.querySelector(
        `[${PERSIST_ATTR}="${el.getAttribute(
          PERSIST_ATTR,
        )}"], link[rel=stylesheet][href="${el.getAttribute("href")}"]`,
      )
    ) {
      const c = document.createElement("link");
      c.setAttribute("rel", "preload");
      c.setAttribute("as", "style");
      c.setAttribute("href", el.getAttribute("href")!);
      links.push(
        new Promise<any>((resolve) => {
          ["load", "error"].forEach((evName) =>
            c.addEventListener(evName, resolve),
          );
          document.head.append(c);
        }),
      );
    }
  }
  return links;
}

// replace head and body of the windows document with contents from newDocument
// if !popstate, update the history entry and scroll position according to toLocation
// if popState is given, this holds the scroll position for history navigation
// if fallback === "animate" then simulate view transitions
async function updateDOM(
  newDocument: Document,
  toLocation: URL,
  options: Options,
  popState?: State,
  fallback?: Fallback,
) {
  // Check for a head element that should persist and returns it,
  // either because it has the data attribute or is a link el.
  // Returns null if the element is not part of the new head, undefined if it should be left alone.
  const persistedHeadElement = (el: HTMLElement): Element | null => {
    const id = el.getAttribute(PERSIST_ATTR);
    const newEl =
      id && newDocument.head.querySelector(`[${PERSIST_ATTR}="${id}"]`);
    if (newEl) {
      return newEl;
    }
    if (el.matches("link[rel=stylesheet]")) {
      const href = el.getAttribute("href");
      return newDocument.head.querySelector(
        `link[rel=stylesheet][href="${href}"]`,
      );
    }
    return null;
  };

  type SavedFocus = {
    activeElement: HTMLElement | null;
    start?: number | null;
    end?: number | null;
  };

  const saveFocus = (): SavedFocus => {
    const activeElement = document.activeElement as HTMLElement;
    // The element that currently has the focus is part of a DOM tree
    // that will survive the transition to the new document.
    // Save the element and the cursor position
    if (activeElement?.closest(`[${PERSIST_ATTR}]`)) {
      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement
      ) {
        const start = activeElement.selectionStart;
        const end = activeElement.selectionEnd;
        return { activeElement, start, end };
      }
      return { activeElement };
    } else {
      return { activeElement: null };
    }
  };

  const restoreFocus = ({ activeElement, start, end }: SavedFocus) => {
    if (activeElement) {
      activeElement.focus();
      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement
      ) {
        activeElement.selectionStart = start!;
        activeElement.selectionEnd = end!;
      }
    }
  };

  const swap = () => {
    // swap attributes of the html element
    // - delete all attributes from the current document
    // - insert all attributes from doc
    // - reinsert all original attributes that are named 'data-astro-*'
    const html = document.documentElement;
    const astro = [...html.attributes].filter(
      ({ name }) => (
        html.removeAttribute(name), name.startsWith("data-astro-")
      ),
    );
    [...newDocument.documentElement.attributes, ...astro].forEach(
      ({ name, value }) => html.setAttribute(name, value),
    );

    // Replace scripts in both the head and body.
    for (const s1 of document.scripts) {
      for (const s2 of newDocument.scripts) {
        if (
          // Inline
          (!s1.src && s1.textContent === s2.textContent) ||
          // External
          (s1.src && s1.type === s2.type && s1.src === s2.src)
        ) {
          // the old script is in the new document: we mark it as executed to prevent re-execution
          s2.dataset.astroExec = "";
          break;
        }
      }
    }

    // Swap head
    for (const el of Array.from(document.head.children)) {
      const newEl = persistedHeadElement(el as HTMLElement);
      // If the element exists in the document already, remove it
      // from the new document and leave the current node alone
      if (newEl) {
        newEl.remove();
      } else {
        // Otherwise remove the element in the head. It doesn't exist in the new page.
        el.remove();
      }
    }

    // Everything left in the new head is new, append it all.
    document.head.append(...newDocument.head.children);

    // Persist elements in the existing body
    const oldBody = document.body;

    const savedFocus = saveFocus();

    // this will reset scroll Position
    document.body.replaceWith(newDocument.body);

    for (const el of oldBody.querySelectorAll(`[${PERSIST_ATTR}]`)) {
      const id = el.getAttribute(PERSIST_ATTR);
      const newEl = document.querySelector(`[${PERSIST_ATTR}="${id}"]`);
      if (newEl) {
        // The element exists in the new page, replace it with the element
        // from the old page so that state is preserved.
        newEl.replaceWith(el);
      }
    }
    restoreFocus(savedFocus);

    if (popState) {
      scrollTo(popState.scrollX, popState.scrollY); // usings 'auto' scrollBehavior
    } else {
      moveToLocation(toLocation, options.history === "replace", false);
    }

    triggerEvent("astro:after-swap");
  };

  const links = stylePreloadLinks(newDocument);
  links.length && (await Promise.all(links));

  if (fallback === "animate") {
    // Trigger the animations
    const currentAnimations = document.getAnimations();
    document.documentElement.dataset.astroTransitionFallback = "old";
    const newAnimations = document
      .getAnimations()
      .filter((a) => !currentAnimations.includes(a) && !isInfinite(a));
    const finished = Promise.all(newAnimations.map((a) => a.finished));
    await finished;
    swap();
    document.documentElement.dataset.astroTransitionFallback = "new";
  } else {
    swap();
  }
}

async function transition(
  direction: Direction,
  toLocation: URL,
  options: Options,
  popState?: State,
) {
  let finished: Promise<void>;
  const href = toLocation.href;
  const init: RequestInit = {
    headers: {
      "astro-suspense-transition": "1",
    },
  };
  if (options.formData) {
    init.method = "POST";
    init.body = options.formData;
  }
  const response = await fetchHTML(href, init);
  // If there is a problem fetching the new page, just do an MPA navigation to it.
  if (response === null) {
    location.href = href;
    return;
  }
  // if there was a redirection, show the final URL in the browser's address bar
  if (response.redirected) {
    toLocation = new URL(response.redirected);
  }

  parser ??= new DOMParser();

  let mainHtml;

  if (response.mediaType === "text/astro-suspense-transition-stream") {
    mainHtml = await response.suspenseStream.next().then((r) => r.value ?? "");
  } else {
    mainHtml = response.html;
  }

  const newDocument = parser.parseFromString(
    mainHtml,
    response.mediaType === "text/astro-suspense-transition-stream"
      ? "text/html"
      : response.mediaType,
  );

  // The next line might look like a hack,
  // but it is actually necessary as noscript elements
  // and their contents are returned as markup by the parser,
  // see https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString
  newDocument.querySelectorAll("noscript").forEach((el) => el.remove());

  // If ViewTransitions is not enabled on the incoming page, do a full page load to it.
  // Unless this was a form submission, in which case we do not want to trigger another mutation.
  if (
    !newDocument.querySelector('[name="astro-view-transitions-enabled"]') &&
    !options.formData
  ) {
    location.href = href;
    return;
  }

  // @ts-expect-error import env
  if (import.meta.env.DEV)
    await prepareForClientOnlyComponents(newDocument, toLocation);

  if (!popState) {
    // save the current scroll position before we change the DOM and transition to the new page
    history.replaceState({ ...history.state, scrollX, scrollY }, "");
  }
  document.documentElement.dataset.astroTransition = direction;
  if (supportsViewTransitions) {
    // @ts-expect-error view transition
    finished = document.startViewTransition(() =>
      updateDOM(newDocument, toLocation, options, popState),
    ).finished;
  } else {
    finished = updateDOM(
      newDocument,
      toLocation,
      options,
      popState,
      getFallback(),
    );
  }
  try {
    await finished;
  } finally {
    // skip this for the moment as it tends to stop fallback animations
    // document.documentElement.removeAttribute('data-astro-transition');
    await runScripts();

    if (response.mediaType === "text/astro-suspense-transition-stream") {
      const node = document.createElement("template");

      for await (const chunk of response.suspenseStream) {
        node.innerHTML = chunk;
        document.body.appendChild(node.content);
        // HACK: Run twice in case suspense chunks added new scripts
        await runScripts();
        await runScripts();
      }
    }

    onPageLoad();
    announce();
  }
}

let navigateOnServerWarned = false;

export function navigate(href: string, options?: Options) {
  if (inBrowser === false) {
    if (!navigateOnServerWarned) {
      // instantiate an error for the stacktrace to show to user.
      const warning = new Error(
        "The view transitions client API was called during a server side render. This may be unintentional as the navigate() function is expected to be called in response to user interactions. Please make sure that your usage is correct.",
      );
      warning.name = "Warning";
      // eslint-disable-next-line no-console
      console.warn(warning);
      navigateOnServerWarned = true;
    }
    return;
  }

  // not ours
  if (!transitionEnabledOnThisPage()) {
    location.href = href;
    return;
  }
  const toLocation = new URL(href, location.href);
  // We do not have page transitions on navigations to the same page (intra-page navigation)
  // *unless* they are form posts which have side-effects and so need to happen
  // but we want to handle prevent reload on navigation to the same page
  // Same page means same origin, path and query params (but maybe different hash)
  if (
    location.origin === toLocation.origin &&
    samePage(toLocation) &&
    !options?.formData
  ) {
    moveToLocation(toLocation, options?.history === "replace", true);
  } else {
    // different origin will be detected by fetch
    transition("forward", toLocation, options ?? {});
  }
}

function onPopState(ev: PopStateEvent) {
  if (!transitionEnabledOnThisPage() && ev.state) {
    // The current page doesn't have View Transitions enabled
    // but the page we navigate to does (because it set the state).
    // Do a full page refresh to reload the client-side router from the new page.
    // Scroll restauration will then happen during the reload when the router's code is re-executed
    if (history.scrollRestoration) {
      history.scrollRestoration = "manual";
    }
    location.reload();
    return;
  }

  // History entries without state are created by the browser (e.g. for hash links)
  // Our view transition entries always have state.
  // Just ignore stateless entries.
  // The browser will handle navigation fine without our help
  if (ev.state === null) {
    if (history.scrollRestoration) {
      history.scrollRestoration = "auto";
    }
    return;
  }

  // With the default "auto", the browser will jump to the old scroll position
  // before the ViewTransition is complete.
  if (history.scrollRestoration) {
    history.scrollRestoration = "manual";
  }

  const state: State = history.state;
  if (state.intraPage) {
    // this is non transition intra-page scrolling
    scrollTo(state.scrollX, state.scrollY);
  } else {
    const nextIndex = state.index;
    const direction: Direction =
      nextIndex > currentHistoryIndex ? "forward" : "back";
    currentHistoryIndex = nextIndex;
    transition(direction, new URL(location.href), {}, state);
  }
}

// There's not a good way to record scroll position before a back button.
// So the way we do it is by listening to scrollend if supported, and if not continuously record the scroll position.
const onScroll = () => {
  updateScrollPosition({ scrollX, scrollY });
};

if (inBrowser) {
  if (supportsViewTransitions || getFallback() !== "none") {
    addEventListener("popstate", onPopState);
    addEventListener("load", onPageLoad);
    if ("onscrollend" in window) addEventListener("scrollend", onScroll);
    else addEventListener("scroll", throttle(onScroll, 350), { passive: true });
  }
  for (const script of document.scripts) {
    script.dataset.astroExec = "";
  }
}

// Keep all styles that are potentially created by client:only components
// and required on the next page
async function prepareForClientOnlyComponents(
  newDocument: Document,
  toLocation: URL,
) {
  // Any client:only component on the next page?
  if (newDocument.body.querySelector(`astro-island[client='only']`)) {
    // Load the next page with an empty module loader cache
    const nextPage = document.createElement("iframe");
    // with srcdoc resolving imports does not work on webkit browsers
    nextPage.src = toLocation.href;
    nextPage.style.display = "none";
    document.body.append(nextPage);
    // silence the iframe's console
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    nextPage.contentWindow!.console = Object.keys(console).reduce(
      (acc: any, key) => {
        acc[key] = () => {};
        return acc;
      },
      {},
    );
    await hydrationDone(nextPage);

    const nextHead = nextPage.contentDocument?.head;
    if (nextHead) {
      // Clear former persist marks
      document.head
        .querySelectorAll(`style[${PERSIST_ATTR}=""]`)
        .forEach((s) => s.removeAttribute(PERSIST_ATTR));

      // Collect the vite ids of all styles present in the next head
      const viteIds = [...nextHead.querySelectorAll(`style[${VITE_ID}]`)].map(
        (style) => style.getAttribute(VITE_ID),
      );
      // Copy required styles to the new document if they are from hydration.
      viteIds.forEach((id) => {
        const style = document.head.querySelector(`style[${VITE_ID}="${id}"]`);
        if (
          style &&
          !newDocument.head.querySelector(`style[${VITE_ID}="${id}"]`)
        ) {
          newDocument.head.appendChild(style.cloneNode(true));
        }
      });
    }

    // return a promise that resolves when all astro-islands are hydrated
    // eslint-disable-next-line no-inner-declarations
    async function hydrationDone(loadingPage: HTMLIFrameElement) {
      await new Promise(
        (r) =>
          loadingPage.contentWindow?.addEventListener("load", r, {
            once: true,
          }),
      );

      // eslint-disable-next-line no-async-promise-executor
      return new Promise<void>(async (r) => {
        for (let count = 0; count <= 20; ++count) {
          if (
            !loadingPage.contentDocument!.body.querySelector(
              "astro-island[ssr]",
            )
          )
            break;
          await new Promise((r2) => setTimeout(r2, 50));
        }
        r();
      });
    }
  }
}

async function* readSuspenseStream(): AsyncGenerator<string> {
  let buffer = "";

  while (true) {
    const { value, done } = await streamReader.read();

    if (value) {
      buffer += value;

      const lines = buffer.split("\n");

      if (lines.length > 1) {
        for (let i = 0; i < lines.length - 1; i++) {
          yield JSON.parse(lines[i]);
        }

        buffer = lines.slice(-1)[0];
      }
    }

    if (done) break;
  }

  if (buffer) yield JSON.parse(buffer);
}
