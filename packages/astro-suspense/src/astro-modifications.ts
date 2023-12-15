/* eslint-disable no-async-promise-executor */
/* eslint-disable no-inner-declarations */
/* eslint-disable @typescript-eslint/ban-ts-comment */

// This file contains modified functions from astro. Things here are here
// because astro doesn't expose them in a suitable way for our purposes.

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

const PERSIST_ATTR = "data-astro-transition-persist";
const VITE_ID = "data-vite-dev-id";

export async function fetchHTML(
  href: string,
  init?: RequestInit,
): Promise<
  | null
  | { html: string; redirected?: string; mediaType: DOMParserSupportedType }
  | {
    streamReader: ReadableStreamDefaultReader<string>;
    redirected?: string;
    mediaType: "text/astro-suspense-transition-stream";
  }
> {
  try {
    const res = await fetch(href, init);
    const mediaType = res.headers.get("content-type")?.replace(/;.*$/, "");

    if (mediaType == "text/astro-suspense-transition-stream") {
      if (!res.body) return null;

      return {
        streamReader: res.body.pipeThrough(new TextDecoderStream()).getReader(),
        redirected: res.redirected ? res.url : undefined,
        mediaType,
      };
    }

    if (mediaType !== "text/html" && mediaType !== "application/xhtml+xml") {
      return null;
    }
    const html = await res.text();
    return {
      html,
      redirected: res.redirected ? res.url : undefined,
      mediaType,
    };
  } catch (err) {
    return null;
  }
}

export function runScripts() {
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

export function preloadStyleLinks(newDocument: Document) {
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

// Keep all styles that are potentially created by client:only components
// and required on the next page
export async function prepareForClientOnlyComponents(
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
    // @ts-ignore
    nextPage.contentWindow!.console = Object.keys(console).reduce(
      (acc: any, key) => {
        acc[key] = () => { };
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
    async function hydrationDone(loadingPage: HTMLIFrameElement) {
      await new Promise(
        (r) =>
          loadingPage.contentWindow?.addEventListener("load", r, {
            once: true,
          }),
      );

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
