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
        font-family: "Montserrat", sans-serif;
        font-size: 0.75rem;
        font-weight: 700;
        line-height: 1rem;
        transition: color 220ms ease, opacity 220ms ease;
      }

      .global-header-link:hover,
      .global-header-link[aria-current="page"] {
        color: rgba(255, 255, 255, 1);
      }

      .global-header-shell {
        padding: 0;
      }

      .global-header-shell--bar {
        padding: 1rem;
      }

      .global-header-breakout {
        width: min(1280px, calc(100vw - 2rem));
        margin-left: 50%;
        transform: translateX(-50%);
      }

      @media (min-width: 768px) {
        .global-header-shell--bar {
          padding: 2rem;
        }

        .global-header-breakout {
          width: min(1280px, calc(100vw - 4rem));
        }
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
      <nav class="global-header-nav hidden md:flex items-center text-white/95" aria-label="Navegacao principal">
        ${navLinks}
      </nav>
    `;
  }

  function renderHeader(container) {
    const isFullBleedHeader = Boolean(container.closest("section.w-screen"));
    const hasLogo = container.querySelector('img[src*="logo-new"], img[src*="Logo"], img[alt*="autenticar" i]');
    const isLogoHeader = container.tagName === "HEADER" && hasLogo;
    const shouldWrap =
      container.classList.contains("site-header") ||
      container.classList.contains("sticky") ||
      isFullBleedHeader ||
      isLogoHeader;
    const isBreakoutLogoHeader =
      isLogoHeader &&
      !isFullBleedHeader &&
      !container.classList.contains("sticky") &&
      !container.classList.contains("site-header");
    const shellClass = isFullBleedHeader || isBreakoutLogoHeader
      ? "global-header-shell"
      : "global-header-shell global-header-shell--bar";
    const markup = `${createBrandMarkup()}${createNavMarkup()}`;

    if (shouldWrap) {
      if (
        isBreakoutLogoHeader
      ) {
        container.classList.add("global-header-breakout");
      }

      container.innerHTML = `
        <div class="${shellClass} mx-auto flex w-full max-w-[1280px] items-center justify-between gap-3">
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
    const isLogoHeader = element.tagName === "HEADER" && hasLogo;

    return Boolean(hasLogo && hasLayoutHint && (hasNavHint || isLogoHeader));
  }

  function findHeaderContainer() {
    const explicitHeader = document.querySelector("header.site-header");
    if (explicitHeader) return explicitHeader;

    return Array.from(document.querySelectorAll("header, div")).find(isHeaderCandidate);
  }

  injectStyles();

  const container = findHeaderContainer();
  if (container) {
    renderHeader(container);
  }
})();
