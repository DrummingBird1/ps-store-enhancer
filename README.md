# 🎮 PS Store Insight

> Formerly GameDeals+. Enhance your PlayStation™ Store experience with price history, cross-platform comparison, review scores, trophy info, wishlist alerts, currency conversion, and smart filters.

![Version](https://img.shields.io/badge/version-2.5.0-blue)
![Manifest](https://img.shields.io/badge/manifest-v3-green)
![Languages](https://img.shields.io/badge/languages-10-orange)
![License](https://img.shields.io/badge/license-MIT-brightgreen)
[![CI](https://github.com/DrummingBird1/ps-store-insight/actions/workflows/ci.yml/badge.svg)](https://github.com/DrummingBird1/ps-store-insight/actions/workflows/ci.yml)

🌐 [**Landing page**](https://drummingbird1.github.io/ps-store-insight/) · 📝 [Changelog](extension/changelog.html) · 🔒 [Privacy policy](https://drummingbird1.github.io/ps-store-insight/privacy-policy.html) · 📖 [README בעברית](README.he.md) · ❤️ [Support on Patreon](https://www.patreon.com/cw/MrIdan)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔎 **Live Search Suggestions** | Enriched dropdown (thumbnail + PC price) as you type in the store search box |
| 📉 **Price History** | Embedded sparkline chart with 12-month history + lowest-ever price |
| 🔀 **Cross-Platform** | Price comparison table — Steam, Epic, GOG, Humble (CheapShark API) |
| 🎁 **Edition Transparency** | Flags cross-platform prices that are for a different bundle/edition (Deluxe, GOTY, etc.) than the page you're on |
| 📊 **Review Scores** | OpenCritic / Metacritic badge next to game title |
| 🏆 **Trophy Info** | Platinum, difficulty, time estimate + live PSN progress bar |
| 🔗 **PSN Sync** | Connect PSN account to auto-sync game library & DLCs |
| ✓ **Mark as Owned** | One-click button on product pages |
| 📈 **Library & Wishlist Stats** | Dashboard: games owned, wishlist size, total wishlist value, deals ready to buy |
| 🔔 **Toolbar Badge** | Live count of wishlist deals at/below target price on the extension icon |
| 🧹 **Smart Filters** | Hide add-ons, DLC, currency packs, and owned games |
| 🗣️ **10 Languages** | EN, HE, AR, ES, FR, DE, PT-BR, RU, JA, KO + manual selector |
| 💾 **Smart Cache** | TTL-based caching (4h–7d) with cache management UI |

---

## 📁 Project Structure

```
gamedeals-plus/
├── extension/                  ← Chrome extension (load this in developer mode)
│   ├── manifest.json           Manifest V3
│   ├── background.js           Service worker — API proxy, PSN sync, cache
│   ├── content.js              DOM injection — cards, badges, filters
│   ├── styles.css              PlayStation-themed styles
│   ├── psn.js                  PSN authentication & library API
│   ├── cache.js                Smart cache with TTL
│   ├── i18n.js                 Multi-language support with manual override
│   ├── popup.html / .js        Quick controls popup
│   ├── options.html / .js      Full settings page
│   ├── welcome.html            Onboarding page (shown on first install)
│   ├── icons/                  Extension icons (16, 48, 128)
│   └── _locales/               10 language translations (113 keys each)
│
├── store-assets/               ← Chrome Web Store listing materials
│   ├── STORE-LISTING.txt       Full description, privacy justifications
│   ├── store-icon-128.png      Store listing icon
│   ├── promo/                  Promotional tiles (440×280, 1280×800)
│   └── screenshots/            4 store screenshots
│
├── docs/                       ← Documentation
│   └── privacy-policy.html     Privacy policy (host on GitHub Pages)
│
├── .gitignore
├── LICENSE
└── README.md                   This file
```

---

## 🚀 Installation

### For Development / Testing

1. Clone this repo
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** → select the `extension/` folder
5. Navigate to [store.playstation.com](https://store.playstation.com)

### From Chrome Web Store

*(Link will be added after publishing)*

---

## 🔗 PSN Account Connection

Connecting your PSN account is **optional**. When connected:
- Your game library syncs automatically every 2 hours
- Owned games and DLCs are hidden from search results
- Trophy progress is shown on product pages

**How to connect:**
1. Sign in to [store.playstation.com](https://store.playstation.com)
2. Open extension settings (⚙)
3. Click "Auto-detect" or enter your NPSSO token manually
4. [How to get NPSSO token →](https://ca.account.sony.com/api/v1/ssocookie)

---

## 🌍 Supported Languages

| Language | Code | RTL |
|----------|------|-----|
| English | `en` | No |
| עברית (Hebrew) | `he` | Yes |
| العربية (Arabic) | `ar` | Yes |
| Español | `es` | No |
| Français | `fr` | No |
| Deutsch | `de` | No |
| Português (BR) | `pt_BR` | No |
| Русский | `ru` | No |
| 日本語 | `ja` | No |
| 한국어 | `ko` | No |

Language can be set manually in Settings → Extension Language.

---

## 🔌 APIs Used

| API | Purpose | Auth |
|-----|---------|------|
| [CheapShark](https://apidocs.cheapshark.com/) | Cross-platform prices + history | Free, no key |
| [OpenCritic](https://opencritic.com/) | Review scores | Public |
| [PSN (Sony)](https://ca.account.sony.com/) | Library sync, trophies | NPSSO OAuth |
| [PSPrices](https://psprices.com/) | Price history link | Link only |
| [PSNProfiles](https://psnprofiles.com/) | Trophy guide link | Link only |

---

## 📦 Publishing to Chrome Web Store

1. Register at [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole) ($5 one-time)
2. Host `docs/privacy-policy.html` (e.g., GitHub Pages)
3. Create new item → upload `extension/` folder as ZIP
4. Fill listing using `store-assets/STORE-LISTING.txt`
5. Upload screenshots from `store-assets/screenshots/`
6. Upload promo images from `store-assets/promo/`
7. Set privacy policy URL → submit for review

---

## ⚠️ Disclaimer

This extension is **not affiliated with, endorsed by, or connected to Sony Interactive Entertainment, PlayStation, or any of their subsidiaries**. PlayStation is a registered trademark of Sony Interactive Entertainment. All product names, logos, and brands are property of their respective owners.

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
