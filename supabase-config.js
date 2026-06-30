// ============================================================
//  إعدادات الاتصال بـ Supabase
//  استبدل القيمتين أدناه بقيم مشروعك من:
//  Supabase → Project Settings → Data API  (و)  API Keys
// ============================================================

const SUPABASE_URL = 'https://pqqhkxwxpptbfepgxwba.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxcWhreHd4cHB0YmZlcGd4d2JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2OTk1NTUsImV4cCI6MjA5NzI3NTU1NX0.5e_53zPz7W8l9lSikP3UmyW1OIIXE8pnmvSZVQ2hLKw';

// إنشاء عميل الاتصال (يأتي من مكتبة supabase-js المحمّلة في index.html)
// flowType: 'implicit' + detectSessionInUrl يضمنان فتح نافذة "كلمة مرور جديدة"
// عند العودة من رابط إعادة التعيين (رمز الاستعادة يأتي في hash الرابط)
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { flowType: 'implicit', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true }
});

// علم تشغيل قاعدة البيانات (أُبقي بنفس الاسم للتوافق مع باقي الكود)
const USE_FIREBASE = true;
