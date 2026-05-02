/* =================================================================
 * Reveal.js initialization + KaTeX rendering + animation event wiring
 * ================================================================= */

Reveal.initialize({
  hash: true,
  controls: true,
  progress: true,
  center: false,
  transition: 'slide',
  width: 1280,
  height: 720,        // 16:9 aspect ratio
  margin: 0.05,
  minScale: 0.4,
  maxScale: 1.6
});

// Render math after slides are in the DOM.
Reveal.on('ready', () => {
  renderMath();
  // If we land on a slide with an animation, init it.
  triggerInit(Reveal.getCurrentSlide());
});

function renderMath() {
  if (typeof renderMathInElement !== 'function') return;
  renderMathInElement(document.body, {
    delimiters: [
      { left: '\\[', right: '\\]', display: true },
      { left: '\\(', right: '\\)', display: false },
      { left: '$$', right: '$$', display: true },
      { left: '$',  right: '$',  display: false }
    ],
    throwOnError: false
  });
}

function triggerInit(slide) {
  if (!slide) return;
  const name = slide.dataset.animInit;
  if (name) Animations.initSlide(name);
}

Reveal.on('slidechanged', (event) => {
  triggerInit(event.currentSlide);
});

Reveal.on('fragmentshown', (event) => {
  const slide = Reveal.getCurrentSlide();
  const slideName = slide ? slide.dataset.animInit : null;
  const step = event.fragment.dataset.step;
  if (slideName && step) {
    Animations.fragmentStep(slideName, step);
  }
});

// Hide the title-slide hint after first navigation.
Reveal.on('slidechanged', () => {
  document.querySelectorAll('.hint').forEach(el => el.style.display = 'none');
});
