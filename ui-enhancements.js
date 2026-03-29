(function () {
  var nav = document.getElementById('nav');
  if (!nav) return;

  function onScroll() {
    if (window.scrollY > 12) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
  }

  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
})();

(function () {
  // Add a simple "active" state for desktop nav links based on section in view.
  var links = Array.from(document.querySelectorAll('.nl a'));
  if (!links.length) return;

  var sectionMap = links
    .map(function (link) {
      var href = link.getAttribute('href') || '';
      if (!href.startsWith('#')) return null;
      var el = document.querySelector(href);
      if (!el) return null;
      return { link: link, section: el };
    })
    .filter(Boolean);

  if (!sectionMap.length) return;

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        var item = sectionMap.find(function (s) {
          return s.section === entry.target;
        });
        if (!item) return;
        if (entry.isIntersecting) {
          links.forEach(function (l) {
            l.classList.remove('is-active');
          });
          item.link.classList.add('is-active');
        }
      });
    },
    { rootMargin: '-35% 0px -55% 0px', threshold: 0.01 }
  );

  sectionMap.forEach(function (item) {
    observer.observe(item.section);
  });
})();
