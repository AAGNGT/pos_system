(function () {
  function normalizeUrl(url) {
    const u = String(url || '').trim();
    return u || null;
  }

  /** 離線可用：不依賴 placehold.co */
  function svgPlaceholder(name) {
    const label = String(name || '商品').slice(0, 4);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
      <rect width="120" height="120" fill="#1e293b" rx="12"/>
      <text x="60" y="68" text-anchor="middle" font-family="system-ui,sans-serif" font-size="28" font-weight="700" fill="#94a3b8">${label.replace(/[<>&"']/g, '')}</text>
    </svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }

  function findInCatalog(item, catalog) {
    if (!Array.isArray(catalog) || !item) return null;
    if (item.product_id != null) {
      const id = Number(item.product_id);
      const byId = catalog.find((p) => p.id === id);
      if (byId) return byId;
    }
    const code = String(item.code || '').trim();
    if (code) return catalog.find((p) => p.code === code) || null;
    return null;
  }

  function resolveThumb(item, catalog) {
    const direct = normalizeUrl(item?.image_url);
    if (direct) return direct;
    const p = findInCatalog(item, catalog);
    return normalizeUrl(p?.image_url) || null;
  }

  function thumbSrc(item, catalog) {
    return resolveThumb(item, catalog) || svgPlaceholder(item?.name);
  }

  window.posProductThumb = {
    normalizeUrl,
    svgPlaceholder,
    resolveThumb,
    thumbSrc,
  };
})();
