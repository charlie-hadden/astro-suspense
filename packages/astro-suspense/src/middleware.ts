import { defineMiddleware } from "astro/middleware";
// @ts-expect-error Seems that vite handles this within astro
import loader from "./loader?raw";
import { SuspensePromises } from "./promises";

export const onRequest = defineMiddleware(async (ctx, next) => {
  // This is quite the hack, but seems to be the most reliable way of determining
  // if the current request is a prerender/static render. It isn't perfect as we
  // will also have headers set whilst using the dev server.
  const firstHeader = ctx.request.headers.keys().next();
  const isPrerender =
    typeof firstHeader.value === "undefined" && firstHeader.done;

  if (!isPrerender) {
    ctx.locals.suspensePromises = new SuspensePromises();
  }

  const response = await next();

  if (
    isPrerender ||
    !(response instanceof Response) ||
    !(response.body instanceof ReadableStream) ||
    response.headers.get("content-type") !== "text/html"
  ) {
    return response;
  }

  if (ctx.request.headers.get("astro-suspense-transition") === "1") {
    const stream = transformSuspenseStream(
      ctx.locals.suspensePromises,
      await response.text(),
    );

    return new Response(stream, {
      ...response,
      headers: {
        ...response.headers,
        vary: [response.headers.get("vary"), "astro-suspense-transition"]
          .filter(Boolean)
          .join("\n"),
        "content-type": "text/astro-suspense-transition-stream",
      },
    });
  }

  const stream = transformStream(ctx.locals.suspensePromises, response.body);

  return new Response(stream, {
    ...response,
    headers: {
      ...response.headers,
      vary: [response.headers.get("vary"), "astro-suspense-transition"]
        .filter(Boolean)
        .join("\n"),
    },
  });
});

function transformStream(
  promises: SuspensePromises,
  body: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const { readable, writable } = new TransformStream<string, string>();

  (async () => {
    await body
      .pipeThrough(new TextDecoderStream())
      .pipeTo(writable, { preventClose: true });

    const writer = writable.getWriter();
    let hasOutputLoader = false;

    for await (const result of promises.resolvePromises()) {
      if (!hasOutputLoader) {
        await writer.write(`<script>${loader}</script>`);
        hasOutputLoader = true;
      }

      await writer.write(suspenseChunk(result));
    }

    await writer.close();
  })();

  return readable.pipeThrough(new TextEncoderStream());
}

function transformSuspenseStream(
  promises: SuspensePromises,
  body: string,
): ReadableStream<Uint8Array> {
  const { readable, writable } = new TransformStream<string, string>();

  (async () => {
    const writer = writable.getWriter();
    let hasOutputLoader = false;

    await writer.write(JSON.stringify(body) + "\n");

    for await (const result of promises.resolvePromises()) {
      if (!hasOutputLoader) {
        await writer.write(JSON.stringify(`<script>${loader}</script>`) + "\n");
        hasOutputLoader = true;
      }

      await writer.write(JSON.stringify(suspenseChunk(result)) + "\n");
    }

    await writer.close();
  })();

  return readable.pipeThrough(new TextEncoderStream());
}

function suspenseChunk(result: { id: number; content: string }): string {
  return `<template astro-suspense-id="${result.id}">${result.content.replace(
    /<\/template>/g,
    "\\x3c/template>",
  )}</template><script astro-suspense-id="${
    result.id
  }">window.astroSuspenseLoad(${result.id})</script>`;
}
