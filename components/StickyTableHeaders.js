'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Attaches a position:fixed clone of every .tbl-wrap table's thead.
 * The clone appears below the sticky nav whenever the original thead
 * scrolls above it. Column widths stay in sync; sort-button clicks
 * are delegated back to the original buttons.
 */
export default function StickyTableHeaders() {
  const pathname = usePathname();

  useEffect(() => {
    const disposers = [];

    function navH() {
      const nav = document.querySelector('nav');
      if (!nav) return 0;
      // Use .bottom so sticky clone tracks the nav even when it scrolls off-screen.
      // When nav is fully visible: bottom ≈ height. When nav scrolls off: bottom → 0.
      return Math.max(0, nav.getBoundingClientRect().bottom);
    }

    function attach(wrapper) {
      if (wrapper._stickyDone) return;
      const table = wrapper.querySelector('table');
      if (!table) return;
      const thead = table.querySelector('thead');
      if (!thead) return;
      wrapper._stickyDone = true;

      // Fixed container clipped to wrapper width
      const bar = document.createElement('div');
      bar.style.cssText =
        'position:fixed;left:0;top:0;z-index:55;overflow:hidden;display:none;' +
        'box-shadow:0 2px 6px rgba(0,0,0,.12);';
      document.body.appendChild(bar);

      let cloneHead = null;
      // Each wrapper has its own rafId — prevents RAF contention between multiple tbl-wrap elements
      let rafId = null;

      function rebuild() {
        const ct = document.createElement('table');
        ct.className = table.className;
        ct.style.cssText = 'margin:0;table-layout:fixed;border-collapse:collapse;';
        const ch = thead.cloneNode(true);
        // delegate sort-button clicks to originals
        const orig = Array.from(thead.querySelectorAll('button'));
        Array.from(ch.querySelectorAll('button')).forEach((btn, i) => {
          if (orig[i]) btn.addEventListener('click', () => orig[i].click());
        });
        ct.appendChild(ch);
        bar.innerHTML = '';
        bar.appendChild(ct);
        cloneHead = ch;
      }

      function tick() {
        rafId = null;
        const nh = navH();
        const wr = wrapper.getBoundingClientRect();
        const tr = thead.getBoundingClientRect();
        const show = tr.bottom <= nh && wr.bottom > nh + 20;

        if (show) {
          if (!cloneHead) rebuild();
          // sync column widths
          const oths = Array.from(thead.querySelectorAll('th'));
          const cths = Array.from(cloneHead.querySelectorAll('th'));
          oths.forEach((th, i) => {
            if (cths[i]) cths[i].style.width = th.getBoundingClientRect().width + 'px';
          });
          bar.style.top   = nh + 'px';
          bar.style.left  = wr.left + 'px';
          bar.style.width = wr.width + 'px';
          // sync horizontal scroll offset via transform
          const ct = bar.querySelector('table');
          if (ct) ct.style.transform = `translateX(${-wrapper.scrollLeft}px)`;
          bar.style.display = 'block';
        } else {
          bar.style.display = 'none';
        }
      }

      function go()    { if (!rafId) rafId = requestAnimationFrame(tick); }
      function reset() { cloneHead = null; go(); }

      window.addEventListener('scroll',  go,    { passive: true });
      window.addEventListener('resize',  reset, { passive: true });
      wrapper.addEventListener('scroll', go,    { passive: true });

      // Rebuild when sort arrows update
      const mo = new MutationObserver(reset);
      mo.observe(thead, { subtree: true, attributes: true, childList: true });

      disposers.push(() => {
        bar.remove();
        delete wrapper._stickyDone;
        if (rafId) cancelAnimationFrame(rafId);
        window.removeEventListener('scroll',  go);
        window.removeEventListener('resize',  reset);
        wrapper.removeEventListener('scroll', go);
        mo.disconnect();
      });
    }

    function scan() {
      document.querySelectorAll('.tbl-wrap').forEach(w => { if (!w._stickyDone) attach(w); });
    }

    // Initial scan (tables may load after API calls — poll for up to 6 s)
    const t0 = setTimeout(scan, 150);
    let polls = 0;
    const iv = setInterval(() => { scan(); if (++polls >= 12) clearInterval(iv); }, 500);

    // MutationObserver: catch .tbl-wrap elements added after the polling window
    // (e.g. tab-switched content, lazy-loaded sections)
    const bodyMo = new MutationObserver(scan);
    bodyMo.observe(document.body, { childList: true, subtree: true });

    return () => {
      clearTimeout(t0);
      clearInterval(iv);
      bodyMo.disconnect();
      disposers.forEach(f => f());
    };
  }, [pathname]);

  return null;
}
