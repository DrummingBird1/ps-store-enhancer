<div dir="rtl">

# 🎮 PS Store Insight

> לשעבר GameDeals+. שדרג את חוויית הקנייה שלך בחנות PlayStation™: היסטוריית מחירים, השוואה חוצת-פלטפורמות, סנכרון ספריית PSN, מידע על גביעים, ציוני Metacritic, ופילטרים חכמים.

![Version](https://img.shields.io/badge/version-2.5.0-blue)
![Manifest](https://img.shields.io/badge/manifest-v3-green)
![Languages](https://img.shields.io/badge/languages-10-orange)
![License](https://img.shields.io/badge/license-MIT-brightgreen)

[English README](README.md) · [🌐 Landing page](https://drummingbird1.github.io/ps-store-insight/) · [❤️ תמכו ב-Patreon](https://www.patreon.com/cw/MrIdan)

---

## ✨ פיצ׳רים

| פיצ׳ר | תיאור |
|------|------|
| 🔎 **הצעות חיפוש חכמות** | תפריט נגלל עם תמונה ומחיר PC בזמן ההקלדה בתיבת החיפוש של החנות |
| 📉 **היסטוריית מחירים** | גרף sparkline משובץ עם היסטוריה של 12 חודשים + המחיר הזול ביותר אי-פעם |
| 🔀 **השוואה חוצת-פלטפורמות** | טבלת השוואה — Steam, Epic, GOG, Humble (CheapShark API) |
| 💱 **המרת מטבע** | 18 מטבעות (EUR, ILS, GBP, JPY, BRL ועוד) עם שערים יומיים מ-Frankfurter |
| 📊 **ציוני ביקורת** | תג OpenCritic / Metacritic ליד שם המשחק |
| 🏆 **מידע על גביעים** | פלטינום, קושי, זמן משוער + פס התקדמות PSN חי |
| ⭐ **רשימת משאלות + התראות** | עקוב אחרי משחקים, קבל התראה כשהמחיר יורד מתחת ליעד |
| 🔗 **סנכרון PSN** *(אופציונלי)* | חבר חשבון PSN כדי לסנכרן אוטומטית ספריית משחקים ו-DLCs |
| ✓ **סמן כנרכש** | כפתור בלחיצה אחת בעמוד מוצר |
| 🧹 **פילטרים חכמים** | הסתר add-ons, DLC, חבילות מטבעות ומשחקים שכבר יש לך |
| 🖱️ **חיפוש בקליק ימני** | סמן טקסט → לחץ ימני → "חפש ב-PS Store Insight" |
| 🎨 **תמה בהירה / כהה** | אוטומטי לפי המערכת או בחירה ידנית |
| 📤 **גיבוי ושחזור** | ייצוא/ייבוא רשימת בעלות ו-wishlist כ-JSON |
| 🗣️ **10 שפות** | EN, HE, AR, ES, FR, DE, PT-BR, RU, JA, KO |
| 💾 **Cache חכם** | TTL מבוקר (4 שעות–7 ימים) + ממשק ניהול |

---

## 🚀 התקנה

### לפיתוח / בדיקה

1. Clone לreop הזה
2. פתח את `chrome://extensions`
3. הפעל **Developer mode** (פינה ימנית עליונה)
4. לחץ **Load unpacked** → בחר את תיקיית `extension/`
5. נווט ל-[store.playstation.com](https://store.playstation.com)

### מ-Chrome Web Store

*(קישור יתווסף לאחר הפרסום)*

---

## 🔗 חיבור חשבון PSN

החיבור הוא **אופציונלי**. כשמחובר:
- ספריית המשחקים מסונכרנת אוטומטית כל שעתיים
- משחקים ו-DLCs שיש לך מוסתרים מתוצאות חיפוש
- התקדמות גביעים מוצגת בעמוד המוצר

**איך לחבר:**
1. התחבר ל-[store.playstation.com](https://store.playstation.com)
2. פתח הגדרות תוסף (⚙)
3. לחץ "Auto-detect" או הזן את NPSSO Token ידנית
4. [איך להשיג NPSSO Token →](https://ca.account.sony.com/api/v1/ssocookie)

---

## 🌍 שפות נתמכות

| שפה | קוד | RTL |
|------|------|-----|
| English | `en` | לא |
| עברית | `he` | כן |
| العربية | `ar` | כן |
| Español | `es` | לא |
| Français | `fr` | לא |
| Deutsch | `de` | לא |
| Português (BR) | `pt_BR` | לא |
| Русский | `ru` | לא |
| 日本語 | `ja` | לא |
| 한국어 | `ko` | לא |

שינוי שפה: Settings → Extension Language.

---

## 🔌 API־ים בשימוש

| API | מטרה | אימות |
|-----|------|------|
| [CheapShark](https://apidocs.cheapshark.com/) | מחירים חוצי-פלטפורמה + היסטוריה | חינמי, ללא מפתח |
| [OpenCritic](https://opencritic.com/) | ציוני ביקורת | ציבורי |
| [Frankfurter](https://frankfurter.dev/) | שערי חליפין יומיים (ECB) | ציבורי |
| [PSN (Sony)](https://ca.account.sony.com/) | סנכרון ספרייה, גביעים | NPSSO OAuth |
| [PSPrices](https://psprices.com/) | קישור להיסטוריית מחיר | לינק בלבד |
| [PSNProfiles](https://psnprofiles.com/) | מדריך גביעים | לינק בלבד |
| [HowLongToBeat](https://howlongtobeat.com/) | זמני סיום | לינק בלבד |

---

## 🛠 פיתוח

```bash
# התקנת תלויות
npm install

# בדיקות יחידה (Jest)
npm test

# Lint
npm run lint

# פורמט
npm run format

# בניית zips
python build-zips.py
```

ראה [TESTING.md](TESTING.md) לרשימת בדיקה ידנית לפני שחרור.

---

## 🤝 תרומה

נשמח לתרומות! ראה [CONTRIBUTING.md](CONTRIBUTING.md).

---

## ⚠️ הצהרה

תוסף זה **אינו מזוהה עם, ממומן על ידי, או קשור ל-Sony Interactive Entertainment, PlayStation, או כל חברת בת שלהם**. PlayStation היא סימן מסחרי רשום של Sony Interactive Entertainment. כל שמות המוצרים, הלוגואים והמותגים שייכים לבעליהם.

---

## 📄 רישיון

MIT License — ראה [LICENSE](LICENSE).

</div>
