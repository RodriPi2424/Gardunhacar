(() => {
  const styleId = "global-header-styles";
  const currentPage = window.location.pathname.split("/").pop() || "index.html";
  const links = [
    { href: "index.html", label: "Inicio" },
    { href: "about-us.html", label: "Quem somos" }
  ];

  function injectStyles() {
    if (document.getElementById(styleId)) return;

    if (!document.querySelector('link[href*="family=Montserrat"]')) {
      const fontLink = document.createElement("link");
      fontLink.rel = "stylesheet";
      fontLink.href = "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap";
      document.head.appendChild(fontLink);
    }

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .global-header-nav {
        display: none;
        align-items: center;
        gap: 1.75rem;
      }

      .global-header-mobile-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.45rem;
        flex: 0 0 auto;
        width: fit-content;
        min-height: 2.25rem;
        padding: 0.55rem 0.75rem 0.55rem 0.85rem;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.95);
        font-family: "Montserrat", sans-serif;
        font-size: 0.68rem;
        font-weight: 700;
        line-height: 1;
        text-decoration: none;
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        transition: transform 220ms ease, background-color 220ms ease, border-color 220ms ease, color 220ms ease;
        white-space: nowrap;
      }

      .global-header-mobile-link svg {
        width: 0.9rem;
        height: 0.9rem;
        transition: transform 220ms ease;
      }

      .global-header-mobile-link:hover,
      .global-header-mobile-link[aria-current="page"] {
        background: rgba(255, 255, 255, 0.14);
        border-color: rgba(255, 255, 255, 0.32);
        color: rgba(255, 255, 255, 1);
      }

      .global-header-mobile-link:hover svg {
        transform: translateX(2px);
      }

      .global-header-host {
        box-sizing: border-box;
        width: 100%;
      }

      @media (max-width: 900px) {
        .global-header-host {
          position: relative !important;
          inset: auto !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          flex-direction: row !important;
          flex-wrap: nowrap !important;
          gap: 0 !important;
          width: 100% !important;
          min-height: auto !important;
          margin: 0 !important;
          padding: 0 !important;
          border: 0 !important;
          border-radius: 0 !important;
          background: #153e4d !important;
          box-shadow: none !important;
          transform: none !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }

        .global-header-shell {
          justify-content: center !important;
          gap: 0 !important;
          max-width: none;
          padding: calc(0.875rem + env(safe-area-inset-top)) 1rem 0.875rem !important;
        }

        .global-header-mobile-link {
          display: none !important;
        }

        main > .w-screen,
        main > section.w-screen {
          left: auto !important;
          right: auto !important;
          width: 100% !important;
          margin-left: 0 !important;
          margin-right: 0 !important;
        }
      }

      .global-header-link {
        padding: 0.375rem 0;
        color: rgba(255, 255, 255, 0.82);
        font-family: "Montserrat", sans-serif;
        font-size: 0.75rem;
        font-weight: 700;
        line-height: 1rem;
        transition: color 220ms ease, opacity 220ms ease;
        text-decoration: none;
      }

      .global-header-link:hover,
      .global-header-link[aria-current="page"] {
        color: rgba(255, 255, 255, 1);
      }

      .global-header-shell {
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: nowrap;
        gap: 0.75rem;
        width: 100%;
        max-width: 1280px;
        margin-left: auto;
        margin-right: auto;
        padding: 0;
      }

      .global-header-brand {
        display: inline-flex;
        align-items: center;
        text-decoration: none;
      }

      .global-header-brand img {
        display: block;
        width: auto;
        height: 2rem;
      }

      .global-header-shell--bar {
        padding: 1rem;
      }

      .global-header-breakout {
        width: min(1280px, calc(100vw - 2rem));
        margin-left: 50%;
        transform: translateX(-50%);
      }

      @media (min-width: 901px) {
        .global-header-shell {
          flex-wrap: nowrap;
        }

        .global-header-mobile-link {
          display: none;
        }

        .global-header-host {
          width: auto;
        }

        .global-header-nav {
          display: flex;
        }

        .global-header-brand img {
          height: 2.5rem;
        }

        .global-header-shell--bar {
          padding: 2rem 0;
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
      <a href="index.html" aria-label="Voltar ao inicio" class="global-header-brand">
        <img src="logo-new-3.png" alt="autenticar" />
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
      <nav class="global-header-nav" aria-label="Navegacao principal">
        ${navLinks}
      </nav>
    `;
  }

  function createMobileActionMarkup() {
    const fallbackLink = links[0];
    const targetLink = links.find(({ href }) => href !== currentPage) || fallbackLink;

    if (!targetLink) return "";

    const mobileLabel = targetLink.href === "about-us.html" ? "Sobre nós" : targetLink.label;

    return `
      <a
        class="global-header-mobile-link"
        href="${targetLink.href}"
      >
        <span>${mobileLabel}</span>
        <svg viewBox="0 0 16 16" aria-hidden="true" fill="none">
          <path d="M3.5 8h8.25M8.75 4.75 12 8l-3.25 3.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </a>
    `;
  }

  function renderHeader(container) {
    container.classList.add("global-header-host");
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
    const shellClass = container.classList.contains("sticky")
      ? "global-header-shell global-header-shell--bar"
      : "global-header-shell";
    const markup = `${createBrandMarkup()}${createMobileActionMarkup()}${createNavMarkup()}`;

    if (shouldWrap) {
      if (
        isBreakoutLogoHeader
      ) {
        container.classList.add("global-header-breakout");
      }

      container.innerHTML = `
        <div class="${shellClass}">
          ${markup}
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="global-header-shell">
        ${markup}
      </div>
    `;
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

  function makeHeaderResponsive(container) {
    const placeholder = document.createComment("global-header-origin");
    const originalParent = container.parentNode;

    if (!originalParent) return;

    originalParent.insertBefore(placeholder, container);

    const syncPlacement = () => {
      const isCompact = window.matchMedia("(max-width: 900px)").matches;

      if (isCompact) {
        if (container.parentNode !== document.body || container !== document.body.firstElementChild) {
          document.body.insertBefore(container, document.body.firstChild);
        }
        return;
      }

      if (placeholder.parentNode && container.parentNode !== placeholder.parentNode) {
        placeholder.parentNode.insertBefore(container, placeholder.nextSibling);
      }
    };

    syncPlacement();
    window.matchMedia("(max-width: 900px)").addEventListener("change", syncPlacement);
  }

  function normalizeText(value) {
    return (value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function removeLegacyGuidanceBlocks() {
    document.querySelectorAll("aside > div.bg-secondary-container").forEach((element) => {
      const text = normalizeText(element.textContent);
      if (
        text.includes("dica segura") ||
        text.includes("dica de") ||
        text.includes("procure sempre carros")
      ) {
        element.remove();
      }
    });

    document.querySelectorAll("section.bg-primary-container, div.bg-primary-container").forEach((element) => {
      const text = normalizeText(element.textContent);
      const isGuideBlock =
        (text.includes("guia para") || text.includes("guia de")) &&
        text.includes("o que verificar") &&
        text.includes("custos ocultos") &&
        (text.includes("seguranca primeiro") || text.includes("euro ncap"));

      if (isGuideBlock) {
        element.remove();
      }
    });
  }

  injectStyles();
  removeLegacyGuidanceBlocks();

  const container = findHeaderContainer();
  if (container) {
    renderHeader(container);
    makeHeaderResponsive(container);
  }
})();
