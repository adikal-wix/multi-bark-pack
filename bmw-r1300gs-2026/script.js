const revealNodes = document.querySelectorAll('.card, .spec-block, .gallery-grid img');

const io = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      io.unobserve(entry.target);
    }
  });
}, { threshold: 0.2 });

revealNodes.forEach((el, idx) => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(20px)';
  el.style.transition = `opacity 420ms ease ${idx * 30}ms, transform 420ms ease ${idx * 30}ms`;
  io.observe(el);
});

document.addEventListener('transitionend', (e) => {
  if (e.target.classList.contains('is-visible')) {
    e.target.style.willChange = 'auto';
  }
});

const style = document.createElement('style');
style.textContent = '.is-visible{opacity:1 !important; transform:translateY(0) !important;}';
document.head.appendChild(style);
