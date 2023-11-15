(() => {
  let element = customElements.get("astro-suspense");

  if (!element) {
    class AstroSuspense extends HTMLElement {}
    element = AstroSuspense;
    customElements.define("astro-suspense", AstroSuspense);
  }

  const observer = new MutationObserver((list) => {
    list.map((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof element!) {
          const template = document.querySelector<HTMLTemplateElement>(
            `template[astro-suspense-id='${node.getAttribute("suspense-id")}']`,
          );

          if (template) {
            node.replaceWith(template.content);
            template.remove();
          }
        }
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
  // TODO: Need this? Something else for view transitions?
  document.addEventListener("DOMContentLoaded", () => observer.disconnect());
})();

// @ts-expect-error window prop
window.astroSuspenseLoad = (id: number) => {
  const script = document.querySelector<HTMLScriptElement>(
    `script[astro-suspense-id='${id}']`,
  );
  const template = document.querySelector<HTMLTemplateElement>(
    `template[astro-suspense-id='${id}']`,
  );
  const suspense = document.querySelector(
    `astro-suspense[suspense-id='${id}']`,
  );

  if (suspense && template) {
    suspense.replaceWith(template.content);
    template.remove();
  }

  script?.remove();
};
