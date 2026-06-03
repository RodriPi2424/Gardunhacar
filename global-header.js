(() => {
  const styleId = "global-header-styles";
  const currentPage = window.location.pathname.split("/").pop() || "index.html";
  const links = [
    { href: "index.html", label: "Inicio" },
    { href: "about-us.html", label: "Quem somos" }
  ];

  function injectStyles() {
    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .global-header-nav {
        gap: 1.75rem;
      }

      .global-header-link {
        padding: 0.375rem 0;
        color: rgba(255, 255, 255, 0.82);
        transition: color 220ms ease, opacity 220ms ease;
      }

      .global-header-link:hover,
      .global-header-link[aria-current="page"] {
        color: rgba(255, 255, 255, 1);
      }
    `;

    document.head.appendChild(style);
  }

  function createBrandMarkup() {
    return `
      <a href="index.html" aria-label="Voltar ao inicio" class="inline-flex items-center">
        <img src="logo-new-3.png" alt="autenticar" class="h-8 md:h-10 w-auto" />
      </a>
    `;
  }

  function createNavMarkup() {
    const navLinks = links
      .map(({ href, label }) => {
        const isCurrent = href === currentPage;
        return `
          <a
            class="global-header-link"
            href="${href}"
            ${isCurrent ? 'aria-current="page"' : ""}
          >${label}</a>
        `;
      })
      .join("");

    return `
      <nav class="global-header-nav hidden md:flex items-center text-white/95 text-xs font-semibold" aria-label="Navegacao principal">
        ${navLinks}
      </nav>
    `;
  }

  function renderHeader(container) {
    const shouldWrap = container.classList.contains("site-header") || container.classList.contains("sticky");
    const markup = `${createBrandMarkup()}${createNavMarkup()}`;

    if (shouldWrap) {
      container.innerHTML = `
        <div class="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-3 flex items-center justify-between gap-3">
          ${markup}
        </div>
      `;
      return;
    }

    container.innerHTML = markup;
  }

  function isHeaderCandidate(element) {
    const hasLogo = element.querySelector('img[src*="logo-new"], img[src*="Logo"], img[alt*="autenticar" i]');
    const hasLayoutHint =
      element.classList.contains("site-header") ||
      element.classList.contains("sticky") ||
      (
        element.classList.contains("flex") &&
        element.classList.contains("items-center") &&
        element.classList.contains("justify-between")
      );
    const hasNavHint = element.querySelector('a[href="quem-somos.html"], a[href="about-us.html"], .brand-nav, nav');

    return Boolean(hasLogo && hasLayoutHint && hasNavHint);
  }

  function findHeaderContainer() {
    return Array.from(document.querySelectorAll("header, div")).find(isHeaderCandidate);
  }

  injectStyles();

  const container = findHeaderContainer();
  if (container) {
    renderHeader(container);
  }
})();
