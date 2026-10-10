# WinBack — צ'קליסט הקמה ל‑Preview (עברית)

מסמך זה מרכז את כל הפעולות שעליך לבצע בעצמך (Vercel, Supabase, Google).
Claude אינו מבצע אותן ואינו משנה Production. בצע לפי הסדר.

> כלל זהב: כל ההגדרות למטה מתחברות אך ורק לפרויקט **WinBack‑Test**
> (`onydgglobiouuusdiuhu`). אל תיגע בערכי Production.

---

## שלב 0 — יצירת מפתח הצפנה (פעם אחת)
במסוף הרץ:
```
openssl rand -hex 32
```
שמור את הפלט — זהו הערך של `GMAIL_TOKEN_ENCRYPTION_KEY`. אל תשתף אותו באף מקום.

---

## שלב 1 — Supabase (פרויקט WinBack‑Test)
1. פתח את WinBack‑Test ← **SQL Editor**. סקור והרץ ידנית את הקובץ
   `supabase/migrations/0011_business_gmail.sql` (רק על WinBack‑Test).
2. **Authentication ← URL Configuration**:
   - **Site URL**: כתובת ה‑Preview שלך.
   - **Redirect URLs**: הוסף `https://<כתובת-ה-preview>/auth/callback`.
   - **Confirm email**: כבה (OFF) — נדרש לבדיקות אוטומטיות.
3. העתק מ‑**Project Settings ← API**: את ה‑URL, את מפתח ה‑anon ואת מפתח
   ה‑service_role (לשלב 3).

---

## שלב 2 — Google Cloud (OAuth ל‑Gmail של הלקוחות)
לקוח OAuth **נפרד** מזה של WinBack Ops.
1. צור/בחר פרויקט ב‑Google Cloud Console.
2. **APIs & Services ← Library**: הפעל את **Gmail API**.
3. **OAuth consent screen**: סוג **External**, מצב **Testing**. הוסף תחת
   **Test users** את כתובות ה‑Gmail לבדיקה (העסק והלקוח). הרשאות (Scopes):
   `.../auth/gmail.readonly` ו‑`.../auth/gmail.send` בלבד.
4. **Credentials ← Create credentials ← OAuth client ID ← Web application**:
   - **Authorized redirect URIs**: הוסף בדיוק
     `https://<כתובת-ה-preview>/api/gmail/callback`
     (חייב להיות זהה ל‑`GOOGLE_GMAIL_REDIRECT_URI` בשלב 3).
   - שמור את **Client ID** ו‑**Client secret**.

---

## שלב 3 — Vercel (משתני סביבה ל‑Preview בלבד)
בפרויקט **winback** ב‑Vercel ← **Settings ← Environment Variables**, הוסף כל
משתנה כשהוא מסומן ל‑**Preview בלבד** (לא Production):

| משתנה | ערך |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ה‑URL של WinBack‑Test |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | מפתח anon של WinBack‑Test |
| `ANTHROPIC_API_KEY` | מפתח Anthropic (שרת בלבד) |
| `SUPABASE_SERVICE_ROLE_KEY` | מפתח service_role (שרת בלבד) |
| `CRON_SECRET` | מחרוזת אקראית ארוכה |
| `WINBACK_GMAIL_ENABLED` | `true` |
| `GOOGLE_GMAIL_CLIENT_ID` | מ‑Google (שלב 2) |
| `GOOGLE_GMAIL_CLIENT_SECRET` | מ‑Google (שלב 2) |
| `GOOGLE_GMAIL_REDIRECT_URI` | `https://<כתובת-ה-preview>/api/gmail/callback` |
| `GMAIL_TOKEN_ENCRYPTION_KEY` | הפלט משלב 0 |
| `WINBACK_GMAIL_ALLOW_SEND` | **השאר ריק** בשלב הפיילוט (שליחה אמיתית כבויה) |

לאחר השמירה, צור Deployment חדש ל‑Preview כדי שהמשתנים ייכנסו לתוקף.

---

## שלב 4 — אימות בידוד (לפני כל בדיקה)
1. פתח את כתובת ה‑Preview, הירשם עם חשבון `@winback.test` זמני והשלם Onboarding.
2. ודא שהמשתמש/העסק נוצרו ב‑WinBack‑Test (SQL:
   `select email from auth.users order by created_at desc limit 5;`) ולא ב‑Production.
3. ודא שב‑Vercel, במסך משתני ה‑Preview, ה‑URL הוא של WinBack‑Test ולא של Production.

---

## שלב 5 — בדיקת Gmail מקצה לקצה (ידנית, בלי שליחה אמיתית)
1. היכנס כ‑"בעל העסק", עבור ל‑**Email** ← **Connect Gmail**, אשר ב‑Google עם
   כתובת הבדיקה.
2. שלח מייל פנייה מכתובת Gmail שנייה שבשליטתך אל תיבת העסק.
3. ב‑WinBack לחץ **Sync inbox** → המייל יופיע.
4. (אופציונלי) קשר את ההודעה לליד, לחץ **Generate AI reply**, ערוך, ואז **Approve**.
5. שליחה אמיתית תישאר חסומה כל עוד `WINBACK_GMAIL_ALLOW_SEND` ריק. כשתרצה
   לבדוק שליחה אמיתית — עדכן אותי, ורק אז נדליק אותו ל‑Preview בלבד.

---

## מה שנשאר באחריותך לאישור (לא אבצע בלי אישורך)
- הרצת המיגרציה `0011` על WinBack‑Test.
- יצירת לקוח ה‑OAuth והמפתחות ב‑Google.
- הדלקת `WINBACK_GMAIL_ALLOW_SEND` לשליחה אמיתית.
- כל Deploy או שינוי ב‑Production.
