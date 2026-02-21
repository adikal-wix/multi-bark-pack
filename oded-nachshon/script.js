const revealNodes = document.querySelectorAll('.reveal');

const io = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        io.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.18 }
);

revealNodes.forEach((node) => io.observe(node));
