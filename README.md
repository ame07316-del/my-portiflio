# Portfolio — Personal Website

A fast, dependency-free personal portfolio: **hand-written HTML + CSS + vanilla JS**.
Bilingual (English ⇄ Arabic with full RTL), dark/light themes, animated on scroll.

## ✨ Features

| Feature | Details |
|---|---|
| 🌍 Bilingual | EN ⇄ AR toggle, switches `dir="rtl"` and re-types the hero. Choice saved in `localStorage`. |
| 🌗 Themes | Dark (default) + light, saved in `localStorage`. |
| ⚡ Zero build step | No npm, no bundler, no framework. Open `index.html` and it runs. |
| 🎞 Motion | Scroll reveals, counters, typing headline, orbiting tech chips, 3D tilt, cursor spotlight. |
| ♿ Accessible | Semantic landmarks, visible focus rings, `aria` states, honours `prefers-reduced-motion`. |
| 🔍 Filterable projects | Category tabs with an empty state. |
| 📱 Responsive | Breakpoints at 1024 / 860 / 640 px, off-canvas mobile nav. |

## 📁 Structure

```
index.html            ← all content lives here
assets/css/style.css  ← design tokens + every component
assets/js/main.js     ← language, theme, nav, reveal, typing, filter, tilt, form
assets/img/           ← put your photo / screenshots here
```

## 🚀 Run locally

```bash
# any static server works
python3 -m http.server 8080
# → http://localhost:8080
```

## ✏️ Make it yours — 6 things to edit

Every spot is marked with an `<!-- ✏️ EDIT ME -->` comment in `index.html`.

1. **Your name** — hero headline, nav logo, footer, and `<title>` / `og:` meta tags.
2. **Rotating headline phrases** — the `PHRASES` object at the top of `assets/js/main.js`.
3. **Projects** — the six `<article class="project">` cards (`#projects`). Keep `data-cat`
   matching one of the filter buttons (`web`, `commerce`, `ui`, `api`) or add a new filter.
4. **Skills** — the `.bar` elements in `#skills`; change the label and `data-level="0-100"`.
5. **Timeline** — the `<ol class="timeline">` in `#journey`.
6. **Contact** — email, phone and social links, plus `MAIL_TO` in `assets/js/main.js`.
   Add a real CV file at `assets/cv.pdf` for the download button.

> **Photo:** drop a picture at `assets/img/me.jpg` and replace the `.portrait__mono`
> div with `<img src="assets/img/me.jpg" alt="Your name">`.

### Want a real contact form?

The form currently opens the visitor's mail client (`mailto:`). To receive submissions
server-side, point it at [Formspree](https://formspree.io) or EmailJS — set the form's
`action`/`method` and remove the `e.preventDefault()` block in `main.js`.

## 🌐 Deploy

- **GitHub Pages** — Settings → Pages → deploy from branch → `main` / root.
- **Netlify / Vercel / Cloudflare Pages** — drag the folder in; no build command needed.

## 🎨 Re-skin in 30 seconds

All colours are CSS custom properties at the top of `assets/css/style.css`:

```css
--violet: #7c5cff;   /* primary accent  */
--teal:   #00e5c0;   /* secondary accent */
--pink:   #ff5c8a;   /* highlight        */
--bg:     #07070c;   /* page background  */
```

Change those four and the whole site follows — gradients, glows, buttons, bars and orbits included.
