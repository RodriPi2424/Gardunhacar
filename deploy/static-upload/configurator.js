const vehicleData = {
  brandLabel: 'Autenticar Exclusive',
  name: 'Volvo EX30',
  description: 'A compact electric SUV presented with the calm, architectural restraint of a premium European configurator.',
  stats: [
    { value: '428 HP', label: 'Power' },
    { value: '3.6 s', label: '0-100 km/h' },
    { value: '480 km', label: 'Range (WLTP)' }
  ],
  colors: [
    {
      id: 'crystal-white',
      name: 'Crystal White',
      hex: '#f5f5f1',
      price: 89900,
      image: './volvo-ex30-stage.png'
    },
    {
      id: 'obsidian-black',
      name: 'Obsidian Black',
      hex: '#191919',
      price: 91800,
      image: './car-view-black-native.png'
    },
    {
      id: 'graphite-silver',
      name: 'Graphite Silver',
      hex: '#9ba0a6',
      price: 92650,
      image: './volvo-ex30-stage.png'
    },
    {
      id: 'sand-dune',
      name: 'Sand Dune',
      hex: '#d7d0c3',
      price: 93400,
      image: './volvo-ex30-stage.png'
    }
  ],
  wheels: [
    { id: '20-aero', name: '20 in Aero', price: 0, spokes: 5, inner: 19, outer: 33, stroke: 1.75 },
    { id: '21-sport', name: '21 in Sport', price: 2400, spokes: 10, inner: 15, outer: 33, stroke: 1.4 },
    { id: '22-turbine', name: '22 in Turbine', price: 3900, spokes: 8, inner: 17, outer: 33, stroke: 1.25 }
  ]
};

const state = {
  selectedColor: vehicleData.colors[0],
  selectedWheel: vehicleData.wheels[1]
};

function formatPrice(value) {
  return `€${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)}`;
}

function wheelSvg(option, isSelected) {
  const angleStep = 360 / option.spokes;
  const spokeLines = Array.from({ length: option.spokes }).map((_, index) => {
    const angle = (angleStep * index * Math.PI) / 180;
    const x1 = 37 + Math.cos(angle) * option.inner;
    const y1 = 37 + Math.sin(angle) * option.inner;
    const x2 = 37 + Math.cos(angle) * option.outer;
    const y2 = 37 + Math.sin(angle) * option.outer;
    return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" />`;
  }).join('');

  return `
    <svg class="wheel-svg" viewBox="0 0 74 74" fill="none" aria-hidden="true">
      <circle cx="37" cy="37" r="32.5" stroke="currentColor" stroke-width="${isSelected ? option.stroke + 0.3 : option.stroke}" opacity="0.92" />
      <circle cx="37" cy="37" r="22.5" stroke="currentColor" stroke-width="1" opacity="0.42" />
      <g stroke="currentColor" stroke-linecap="round" stroke-width="${option.stroke}">${spokeLines}</g>
      <circle cx="37" cy="37" r="6.5" fill="currentColor" opacity="0.1" stroke="currentColor" stroke-width="1" />
    </svg>
  `;
}

function VehicleStats(stats) {
  return `
    <div class="grid grid-cols-3 gap-6 lg:gap-10 text-right">
      ${stats.map((stat) => `
        <div class="min-w-[84px]">
          <div class="stat-value text-[28px] md:text-[32px] font-light text-ink leading-none">${stat.value}</div>
          <div class="mt-2 text-[11px] uppercase tracking-[0.18em] text-muted">${stat.label}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function ColorSelector(colors, selectedColorId) {
  return `
    <div>
      <div class="text-[12px] uppercase tracking-[0.2em] text-muted">Exterior Color</div>
      <div class="mt-4 flex items-center gap-3">
        ${colors.map((color) => {
          const isSelected = color.id === selectedColorId;
          return `
            <button
              type="button"
              class="swatch relative h-9 w-9 rounded-full ${isSelected ? 'scale-110 ring-1 ring-ink ring-offset-4 ring-offset-white' : 'ring-1 ring-black/10'}"
              style="background:${color.hex}"
              data-color="${color.id}"
              aria-label="${color.name}"
              aria-pressed="${isSelected}"
              title="${color.name}"
            >
              <span class="sr-only">${color.name}</span>
            </button>
          `;
        }).join('')}
      </div>
      <div class="mt-3 text-[13px] text-ink">${state.selectedColor.name}</div>
    </div>
  `;
}

function WheelSelector(wheels, selectedWheelId) {
  return `
    <div>
      <div class="text-[12px] uppercase tracking-[0.2em] text-muted">Wheels</div>
      <div class="mt-4 flex items-center gap-4 md:gap-5">
        ${wheels.map((wheel) => {
          const isSelected = wheel.id === selectedWheelId;
          const stateClasses = isSelected ? 'text-ink scale-[1.04]' : 'text-[#8a8a8a]';
          return `
            <button
              type="button"
              class="wheel-option flex flex-col items-center gap-2 ${stateClasses}"
              data-wheel="${wheel.id}"
              aria-pressed="${isSelected}"
            >
              ${wheelSvg(wheel, isSelected)}
              <span class="text-[13px] leading-none">${wheel.name}</span>
            </button>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function PriceSection(totalPrice) {
  return `
    <div class="text-left lg:text-right">
      <div class="text-[12px] uppercase tracking-[0.2em] text-muted">Total Price</div>
      <div class="mt-4 text-[36px] md:text-[42px] font-semibold tracking-[-0.04em] text-ink">${formatPrice(totalPrice)}</div>
      <div class="mt-2 text-[13px] text-muted">Including selected exterior finish and wheels.</div>
    </div>
  `;
}

function ActionButtons() {
  return `
    <div>
      <div class="text-[12px] uppercase tracking-[0.2em] text-muted">Actions</div>
      <div class="mt-4 flex flex-col sm:flex-row lg:justify-end gap-3">
        <button type="button" class="config-button h-12 rounded-full border border-ink bg-white px-6 text-[14px] font-medium text-ink">Get Quote</button>
        <button type="button" class="config-button h-12 rounded-full bg-ink px-6 text-[14px] font-medium text-white shadow-soft">Next Step</button>
      </div>
    </div>
  `;
}

function VehicleHero() {
  return `
    <section class="relative isolate overflow-hidden">
      <div class="absolute inset-0 showroom-backdrop"></div>
      <div class="absolute inset-0 showroom-architecture"></div>
      <div class="hero-layout relative px-6 pt-6 md:px-12 md:pt-8 lg:px-16">
        <header class="absolute left-0 right-0 top-0 z-20 h-20 px-6 md:px-12 lg:px-16">
          <div class="flex h-full items-center justify-between gap-4">
            <div class="text-[20px] md:text-[24px] font-semibold tracking-[-0.05em] text-ink">autenticar</div>
            <div class="hidden md:block text-[13px] uppercase tracking-[0.28em] text-muted">${vehicleData.brandLabel}</div>
            <nav class="flex items-center gap-6 text-[13px] text-ink/80">
              <a href="#" class="hover:text-ink transition-colors">Menu</a>
            </nav>
          </div>
        </header>

        <div class="relative flex min-h-0 flex-col justify-end pt-20 lg:pt-24">
          <div class="pointer-events-none absolute inset-x-0 bottom-[10%] z-0 mx-auto w-[82vw] max-w-[960px] lg:w-[58vw]">
            <div class="vehicle-shadow"></div>
            <div class="vehicle-stage relative mx-auto w-full">
              <img id="vehicle-image" src="${state.selectedColor.image}" alt="${vehicleData.name} in ${state.selectedColor.name}" class="mx-auto w-full max-w-[960px] object-contain" />
            </div>
          </div>

          <div class="relative z-10 mt-auto grid gap-10 pb-12 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-16 lg:pb-14">
            <div class="max-w-[560px] self-end">
              <div class="text-[12px] uppercase tracking-[0.24em] text-muted">Electric Performance SUV</div>
              <h1 class="mt-5 text-[44px] font-light leading-[0.94] tracking-[-0.05em] text-ink md:text-[56px] lg:text-[64px]">${vehicleData.name}</h1>
              <p class="mt-5 max-w-[500px] text-[15px] leading-7 text-muted md:text-[16px]">${vehicleData.description}</p>
            </div>
            <div class="self-end lg:pb-3">
              ${VehicleStats(vehicleData.stats)}
            </div>
          </div>
        </div>
      </div>

      <div class="config-panel relative z-20 border-t border-line bg-white px-6 py-7 md:px-12 lg:px-16">
        <div class="grid gap-8 lg:grid-cols-[1.2fr_1.2fr_0.9fr_0.9fr] lg:items-center">
          <div id="color-selector">${ColorSelector(vehicleData.colors, state.selectedColor.id)}</div>
          <div id="wheel-selector">${WheelSelector(vehicleData.wheels, state.selectedWheel.id)}</div>
          <div id="price-section">${PriceSection(totalPrice())}</div>
          <div id="action-buttons">${ActionButtons()}</div>
        </div>
      </div>
    </section>
  `;
}

function totalPrice() {
  return state.selectedColor.price + state.selectedWheel.price;
}

function App() {
  return `
    <div class="config-shell">
      ${VehicleHero()}
    </div>
  `;
}

function bindEvents() {
  document.querySelectorAll('[data-color]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextColor = vehicleData.colors.find((color) => color.id === button.dataset.color);
      if (!nextColor) return;
      state.selectedColor = nextColor;
      updateSelections();
    });
  });

  document.querySelectorAll('[data-wheel]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextWheel = vehicleData.wheels.find((wheel) => wheel.id === button.dataset.wheel);
      if (!nextWheel) return;
      state.selectedWheel = nextWheel;
      updateSelections();
    });
  });
}

function updateSelections() {
  const image = document.getElementById('vehicle-image');
  if (image) {
    image.animate(
      [
        { opacity: 0.56, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ],
      { duration: 320, easing: 'cubic-bezier(.22,1,.36,1)' }
    );
    image.src = state.selectedColor.image;
    image.alt = `${vehicleData.name} in ${state.selectedColor.name}`;
  }

  document.getElementById('color-selector').innerHTML = ColorSelector(vehicleData.colors, state.selectedColor.id);
  document.getElementById('wheel-selector').innerHTML = WheelSelector(vehicleData.wheels, state.selectedWheel.id);
  document.getElementById('price-section').innerHTML = PriceSection(totalPrice());
  bindEvents();
}

function mount() {
  const app = document.getElementById('app');
  app.innerHTML = App();
  bindEvents();
}

mount();
