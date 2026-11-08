/* =========================================================================
   Parktronikai – bendra prototipo logika (tik UI būsena, jokio backend'o)
   - demo rolė (vairuotojas / savininkas / administratorius)
   - „Grįžti“ ir dialogų uždarymas
   - formų validacija ir sėkmės / klaidos pranešimai
   - statiniai (mock) duomenys pagal ataskaitos 2.3 skyriaus esybes
   ========================================================================= */
(function () {
  'use strict';

  // Prototipo šaknis (Parktronikai/) – nustatoma pagal šio failo vietą
  var SCRIPT = document.currentScript;
  var ROOT = SCRIPT ? new URL('../', SCRIPT.src) : new URL('./', location.href);

  // Grįžus naršyklės „atgal“ puslapis perkraunamas, kad būsena (pvz. pasirinkta zona) būtų aktuali
  window.addEventListener('pageshow', function (e) { if (e.persisted) location.reload(); });

  var PREFIX = 'parktronikai.';
  function get(key) { try { return sessionStorage.getItem(PREFIX + key); } catch (e) { return null; } }
  function set(key, val) {
    try {
      if (val === null || val === undefined) sessionStorage.removeItem(PREFIX + key);
      else sessionStorage.setItem(PREFIX + key, val);
    } catch (e) { /* saugykla neprieinama – prototipas veikia ir be jos */ }
  }

  /* ---------- Mock duomenys ---------- */
  // Parkavimo_zona + Apmokestinimo_laikas + Parkavimo_zonos_koordinate
  var ZONES = {
    A: { id: 'A', Zonos_pavadinimas: 'A zona – Senamiestis', Adresas: 'Vilniaus g., Kaunas', Tarifas_val: 2.5,
         Skaiciuojamas_intervalas_min: 15, Mokejimo_gavejas: 'Kauno miesto savivaldybė', Ar_aktyvi: true, busena: 'warn',
         laikai: [['Pirmadienis–Penktadienis', '08:00', '20:00'], ['Šeštadienis', '10:00', '18:00']],
         points: [[110, 80], [300, 60], [320, 190], [130, 210]] },
    B: { id: 'B', Zonos_pavadinimas: 'B zona – Centras', Adresas: 'Laisvės al., Kaunas', Tarifas_val: 1.2,
         Skaiciuojamas_intervalas_min: 15, Mokejimo_gavejas: 'Kauno miesto savivaldybė', Ar_aktyvi: true, busena: 'free',
         laikai: [['Pirmadienis–Penktadienis', '08:00', '20:00']],
         points: [[375, 70], [585, 90], [565, 205], [365, 200]] },
    C: { id: 'C', Zonos_pavadinimas: 'C zona – Žaliakalnis', Adresas: 'Savanorių pr., Kaunas', Tarifas_val: 0.6,
         Skaiciuojamas_intervalas_min: 30, Mokejimo_gavejas: 'Kauno miesto savivaldybė', Ar_aktyvi: true, busena: 'full',
         laikai: [['Pirmadienis–Penktadienis', '08:00', '18:00']],
         points: [[130, 265], [320, 255], [335, 400], [150, 415]] },
    D: { id: 'D', Zonos_pavadinimas: 'D zona – Šančiai', Adresas: 'Kranto al., Kaunas', Tarifas_val: 0.3,
         Skaiciuojamas_intervalas_min: 60, Mokejimo_gavejas: 'Kauno miesto savivaldybė', Ar_aktyvi: false, busena: 'off',
         laikai: [['Pirmadienis–Penktadienis', '09:00', '17:00']],
         points: [[425, 262], [650, 255], [668, 405], [442, 415]] }
  };
  var ZONE_STATUS = {
    free: { label: 'Laisvų vietų yra', badge: 'badge-ok' },
    warn: { label: 'Beveik pilna', badge: 'badge-warn' },
    full: { label: 'Užimta', badge: 'badge-danger' },
    off:  { label: 'Neaktyvi', badge: 'badge-off' }
  };
  // Transporto_priemone
  var CARS = [
    { Valstybinis_numeris: 'ABC 123', Marke: 'Toyota', Modelis: 'Corolla', Transporto_priemones_tipas: 'Lengvasis', Kuro_tipas: 'Hibridas' },
    { Valstybinis_numeris: 'KLM 456', Marke: 'Volkswagen', Modelis: 'Golf', Transporto_priemones_tipas: 'Lengvasis', Kuro_tipas: 'Dyzelinas' }
  ];
  var ROLES = { vairuotojas: 'Vairuotojas', savininkas: 'Aikštelės savininkas', administratorius: 'Administratorius' };

  function money(v) { return v.toFixed(2).replace('.', ',') + ' €'; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function hms(ms) { var s = Math.max(0, Math.floor(ms / 1000)); return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60); }
  function clock(ts) { var d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function currentZone() {
    var id = new URLSearchParams(location.search).get('zona') || get('zona') || 'A';
    return ZONES[id] || ZONES.A;
  }
  function currentCar() {
    var nr = get('car');
    return CARS.filter(function (c) { return c.Valstybinis_numeris === nr; })[0] || CARS[0];
  }

  /* ---------- Žemėlapis (SVG) ---------- */
  var NS = 'http://www.w3.org/2000/svg';
  function el(name, attrs, text) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (text) n.textContent = text;
    return n;
  }
  function renderMap(svg, opts) {
    opts = opts || {};
    svg.setAttribute('viewBox', '0 0 800 480');
    svg.appendChild(el('path', { 'class': 'river', d: 'M0,458 C200,438 420,476 800,446' }));
    svg.appendChild(el('path', { 'class': 'street', d: 'M0,234 H800' }));
    svg.appendChild(el('path', { 'class': 'street', d: 'M345,0 V480' }));
    svg.appendChild(el('path', { 'class': 'street', d: 'M705,0 L690,480' }));
    svg.appendChild(el('path', { 'class': 'street', d: 'M0,28 L800,8' }));
    svg.appendChild(el('text', { 'class': 'map-label', x: 20, y: 228 }, 'Laisvės al.'));
    svg.appendChild(el('text', { 'class': 'map-label', x: 352, y: 470 }, 'Savanorių pr.'));
    svg.appendChild(el('text', { 'class': 'map-label', x: 600, y: 470 }, 'Nemunas'));
    Object.keys(ZONES).forEach(function (id) {
      var z = ZONES[id];
      var pts = z.points.map(function (p) { return p.join(','); }).join(' ');
      var cx = z.points.reduce(function (s, p) { return s + p[0]; }, 0) / z.points.length;
      var cy = z.points.reduce(function (s, p) { return s + p[1]; }, 0) / z.points.length;
      var parent = svg;
      if (opts.link) {
        parent = el('a', { href: opts.link(z), 'aria-label': z.Zonos_pavadinimas + ' – ' + ZONE_STATUS[z.busena].label });
        svg.appendChild(parent);
      }
      parent.appendChild(el('polygon', { 'class': 'zone zone-' + z.busena, points: pts }));
      parent.appendChild(el('text', { 'class': 'zone-label', x: cx, y: cy - 4, 'text-anchor': 'middle' }, z.Zonos_pavadinimas.split(' – ')[0]));
      if (!opts.muted) {
        parent.appendChild(el('text', { 'class': 'zone-sub', x: cx, y: cy + 14, 'text-anchor': 'middle' },
          ZONE_STATUS[z.busena].label + ' · ' + money(z.Tarifas_val) + '/val.'));
      }
    });
  }
  // Zonos ribų žymėjimas: kiekvienas paspaudimas prideda ribos tašką
  function mapEditor(svg, points, counterEl) {
    svg.classList.add('editable');
    var shape = el('polygon', { 'class': 'draw-shape' });
    var dots = el('g', {});
    svg.appendChild(shape); svg.appendChild(dots);
    function draw() {
      shape.setAttribute('points', points.map(function (p) { return p.join(','); }).join(' '));
      while (dots.firstChild) dots.removeChild(dots.firstChild);
      points.forEach(function (p) { dots.appendChild(el('circle', { 'class': 'draw-point', cx: p[0], cy: p[1], r: 7 })); });
      if (counterEl) counterEl.textContent = points.length;
    }
    svg.addEventListener('click', function (e) {
      var pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      var loc = pt.matrixTransform(svg.getScreenCTM().inverse());
      points.push([Math.round(loc.x), Math.round(loc.y)]);
      draw();
    });
    draw();
    return { clear: function () { points.length = 0; draw(); }, undo: function () { points.pop(); draw(); } };
  }

  /* ---------- Rodymas / slėpimas ---------- */
  function show(x) { var n = typeof x === 'string' ? document.getElementById(x) : x; if (n) n.hidden = false; return n; }
  function hide(x) { var n = typeof x === 'string' ? document.getElementById(x) : x; if (n) n.hidden = true; return n; }

  /* ---------- Formų validacija ---------- */
  function markInvalid(input, msg) {
    var field = input.closest('.field') || input.parentElement;
    field.classList.add('invalid');
    var err = document.createElement('span');
    err.className = 'field-error';
    err.textContent = msg;
    field.appendChild(err);
  }
  function clearErrors(form) {
    form.querySelectorAll('.field.invalid').forEach(function (f) { f.classList.remove('invalid'); });
    form.querySelectorAll('.field-error').forEach(function (e) { e.remove(); });
  }
  function validateForm(form) {
    clearErrors(form);
    var ok = true;
    form.querySelectorAll('[data-required]').forEach(function (inp) {
      var v = (inp.value || '').trim();
      var msg = null;
      if (!v) msg = inp.getAttribute('data-error-msg') || 'Šis laukas privalomas.';
      else if (inp.type === 'email' && !/^\S+@\S+\.\S+$/.test(v)) msg = 'Neteisingas el. pašto formatas.';
      if (msg) { ok = false; markInvalid(inp, msg); }
    });
    form.querySelectorAll('[data-match]').forEach(function (inp) {
      var other = document.getElementById(inp.getAttribute('data-match'));
      if (other && inp.value !== other.value) { ok = false; markInvalid(inp, 'Slaptažodžiai nesutampa.'); }
    });
    return ok;
  }
  // Rezultatas formoje: slepia [data-hide-on-success], rodo [data-show-on-success] ir #data-result
  function showSuccess(form, resultId) {
    form.querySelectorAll('[data-form-error]').forEach(hide);
    form.querySelectorAll('[data-hide-on-success]').forEach(hide);
    form.querySelectorAll('[data-show-on-success]').forEach(show);
    var r = show(resultId || form.getAttribute('data-result'));
    if (r && r.scrollIntoView) r.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    // Grąžinimas į ankstesnį langą po išsaugojimo (pvz. 2.2.30)
    var ret = form.getAttribute('data-return');
    if (ret) setTimeout(function () { goTo(ret, true); }, 1200);
  }
  function showFormError(form, text) {
    var box = form.querySelector('[data-form-error]');
    if (!box) return;
    if (text) { var t = box.querySelector('[data-text]'); if (t) t.textContent = text; }
    show(box);
    if (box.scrollIntoView) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /* ---------- Grįžti / uždaryti dialogą ---------- */
  // loose = true: grįžtama į bet kurį ankstesnį šios sistemos langą (Grįžti / Atšaukti);
  // loose = false: grįžtama tik jei ankstesnis langas yra būtent href (kitaip pereinama į href)
  // Ankstesnis langas įsimenamas sesijoje, nes atidarius failą tiesiai (file://) naršyklė document.referrer nepateikia
  var PREV = get('last') || document.referrer || '';
  function goTo(href, replace, loose) {
    try {
      if (PREV && history.length > 1) {
        var r = new URL(PREV), t = new URL(href, location.href);
        if (r.href !== location.href && (loose || decodeURI(r.pathname) === decodeURI(t.pathname))) { history.back(); return; }
      }
    } catch (e) { /* ignoruojama */ }
    if (replace) location.replace(href); else location.href = href;
  }

  /* ---------- Navigacijos juosta (navbar) ---------- */
  var ALL = ['vairuotojas', 'savininkas', 'administratorius'];
  var NAV = [
    { label: 'Vairuotojo langas', window: 'Vairuotojo pagrindinis langas', href: 'Klientų_dalis/Vair_pagr.html', roles: ALL,
      match: ['Klientų_dalis/Vair_pagr', 'Klientų_dalis/Zon_info', 'Klientų_dalis/Auto_pas', 'Aktyvus_parkavimas/'] },
    { label: 'Įvažiavimo tikrinimas', window: 'Įvažiavimo tikrinimo langas', href: 'Klientų_dalis/Ivaz_tikr.html', roles: ALL,
      match: ['Klientų_dalis/Ivaz_tikr'] },
    { label: 'Aikštelės savininko langas', window: 'Aikštelės savininko pagrindinis langas', href: 'Privačios_parkavimo_vietos/Aiks_sav_pagr.html',
      roles: ['savininkas', 'administratorius'], match: ['Privačios_parkavimo_vietos/'] },
    { label: 'Administratoriaus langas', window: 'Administratoriaus pagrindinis langas', href: 'Administravimas/Admin_pagr.html',
      roles: ['administratorius'], match: ['Administravimas/', 'Parkavimo_zonos/'] }
  ];
  var USER_ICON = '<svg class="icon-user" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
    '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>';

  function relPath() {
    var p = decodeURIComponent(location.pathname), base = decodeURIComponent(ROOT.pathname);
    return p.indexOf(base) === 0 ? p.slice(base.length) : p;
  }
  function navLink(href, html, title, active, cls) {
    var a = document.createElement('a');
    a.href = new URL(href, ROOT).href;
    a.className = cls + (active ? ' active' : '');
    a.title = title;
    a.innerHTML = html;
    if (active) a.setAttribute('aria-current', 'page');
    return a;
  }
  function buildNav(role) {
    var bar = document.querySelector('header.topbar:not(.external)');
    if (!bar || !role || document.body.hasAttribute('data-no-nav')) return;
    var rel = relPath();
    var isActive = function (m) { return m.some(function (x) { return rel.indexOf(x) === 0; }); };

    var nav = document.createElement('nav');
    nav.className = 'mainnav';
    nav.setAttribute('aria-label', 'Pagrindinė navigacija');
    NAV.forEach(function (item) {
      if (item.roles.indexOf(role) === -1) return;
      nav.appendChild(navLink(item.href, esc(item.label), item.window, isActive(item.match), 'nav-link'));
    });

    var right = document.createElement('div');
    right.className = 'nav-right';
    var badge = bar.querySelector('.role-badge');
    if (badge) right.appendChild(badge);
    right.appendChild(navLink('Klientų_dalis/Pask_perz.html', USER_ICON + '<span>Paskyra</span>', 'Paskyros peržiūros langas',
      isActive(['Klientų_dalis/Pask_']), 'nav-link nav-account'));
    right.appendChild(navLink('Klientų_dalis/Ats_patv.html', 'Atsijungti', 'Atsijungimo patvirtinimo langas', false, 'nav-link nav-logout'));

    var brand = bar.querySelector('.brand');
    if (brand && brand.nextSibling) bar.insertBefore(nav, brand.nextSibling); else bar.appendChild(nav);
    bar.appendChild(right);
    bar.classList.add('has-nav');
  }

  window.PT = {
    get: get, set: set, ZONES: ZONES, ZONE_STATUS: ZONE_STATUS, CARS: CARS, ROLES: ROLES,
    money: money, hms: hms, clock: clock, esc: esc, currentZone: currentZone, currentCar: currentCar,
    renderMap: renderMap, mapEditor: mapEditor, show: show, hide: hide,
    validateForm: validateForm, clearErrors: clearErrors, showSuccess: showSuccess, showFormError: showFormError, goTo: goTo,
    prev: PREV
  };

  /* ---------- Inicializacija ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    // Įsimenamas tik tikras langas (ne dialogas ir ne dialogo fonas iframe'e)
    if (window.top === window && !document.body.classList.contains('dialog-page')) set('last', location.href);

    // Rolė: ?role=... (demo prisijungimas) arba sesijoje išsaugota
    var qRole = new URLSearchParams(location.search).get('role');
    if (qRole && ROLES[qRole]) set('role', qRole);
    if (document.body.hasAttribute('data-logout')) { set('role', null); set('car', null); set('zona', null); }
    var role = get('role');

    document.querySelectorAll('[data-role-label]').forEach(function (n) {
      n.textContent = role ? 'Rolė: ' + ROLES[role] : 'Svečias (neprisijungęs)';
    });
    document.querySelectorAll('[data-role-name]').forEach(function (n) { n.textContent = role ? ROLES[role] : '—'; });
    document.querySelectorAll('[data-roles]').forEach(function (n) {
      var allowed = n.getAttribute('data-roles').split(/\s+/);
      n.hidden = !(role && allowed.indexOf(role) !== -1);
    });

    buildNav(role);

    document.querySelectorAll('[data-back]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); goTo(a.getAttribute('href'), false, true); });
    });
    document.querySelectorAll('[data-close]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); goTo(a.getAttribute('href'), true, true); });
    });

    // Formos: data-result -> lieka tame pačiame lange ir rodo rezultatą;
    //         data-validate -> po sėkmingos validacijos vykdomas įprastas perėjimas (action)
    document.querySelectorAll('form[data-result], form[data-validate]').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        var ok = validateForm(form);
        if (form.hasAttribute('data-result')) {
          e.preventDefault();
          if (ok) showSuccess(form); else showFormError(form);
        } else if (!ok) {
          e.preventDefault();
          showFormError(form);
        }
      });
    });
  });
})();
