import { defineMiddleware } from "astro/middleware";
// @ts-expect-error Seems that vite handles this within astro
import loader from './loader?raw'
import { SuspensePromises } from "./promises";

export const onRequest = defineMiddleware(async (ctx, next) => {
  // This is quite the hack, but seems to be the most reliable way of determining
  // if the current request is a prerender/static render. It isn't perfect as we
  // will also have headers set whilst using the dev server.
  const firstHeader = ctx.request.headers.keys().next();
  const isPrerender = typeof firstHeader.value === 'undefined' && firstHeader.done;

  if (!isPrerender) {
    ctx.locals.suspensePromises = new SuspensePromises();
  }

  const response = await next();

  // TODO: Check content type
  if (isPrerender || !(response instanceof Response) || !(response.body instanceof ReadableStream)) {
    return response;
  }

  const stream = transformStream(ctx.locals.suspensePromises, response.body);

  return new Response(stream, response);
});

function transformStream(promises: SuspensePromises, body: ReadableStream<Uint8Array>): ReadableStream<string> {
  const { readable, writable } = new TransformStream<Uint8Array | string, string>();

  (async () => {
    await body.pipeTo(writable, { preventClose: true });

    const writer = writable.getWriter();
    let hasOutputLoader = false;

    for await (const result of promises.resolvePromises()) {
      if (!hasOutputLoader) {
        await writer.write(`<script>${loader}</script>`);
        hasOutputLoader = true;
      }

      await writer.write(`<template astro-suspense-id="${result.id}">${result.content.replace(/<\/template>/g, "\\x3c/template>")}</template>`);
    }

    await writer.close();
  })();

  return readable;
}
