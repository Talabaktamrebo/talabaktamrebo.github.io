// ===== SUPABASE DATA LAYER =====
const PAGE_SIZE = 20;
let lastDoc = null;     // (غير مستخدم — أُبقي للتوافق)
let _adsOffset = 0;     // موضع التحميل للصفحات (pagination)
let allLoaded = false;

// يحوّل صفّ Supabase إلى نفس شكل الكائن الذي يتوقّعه باقي الموقع
function mapRow(d) {
  return {
    id: d.id,
    ref: d.ref || '',
    catId: d.category || d.catId || '',
    type: d.type, action: d.action, status: d.status, views: d.views,
    title: d.title || '',
    price: d.price || 0,
    location: d.location || '',
    mapUrl: d.map_url || '',
    city: d.city || '',
    neighborhood: d.neighborhood || '',
    desc: d.description || d.desc || '',
    phone: d.phone || '',
    images: d.images || d.image_urls || [],
    image_ids: d.image_ids || [],
    featured: d.featured || false,
    negotiable: d.negotiable || false,
    rooms: d.rooms, baths: d.baths, area: d.area, kitchens: d.kitchens,
    balconies: d.balconies, living: d.living, storage: d.storage,
    carType: d.car_type, carModel: d.car_model, carYear: d.car_year,
    carKm: d.car_km, carColor: d.car_color, carClass: d.car_class,
    shopArea: d.shop_area, shopFloor: d.shop_floor, shopFronts: d.shop_fronts, shopUse: d.shop_use,
    farmArea: d.farm_area, farmTrees: d.farm_trees, farmWater: d.farm_water, farmType: d.farm_type,
    profession: d.profession,
    freeGroup: d.free_group || null,
    partnerOffer: d.partner_offer || '', partnerSector: d.partner_sector || '', partnerSeek: d.partner_seek || '', partnerType: d.partner_type || '',
    rating: (d.rating == null ? null : Number(d.rating)),
    oldPrice: (d.old_price == null ? null : Number(d.old_price)),
    video: d.video_url || '',
    isAuction: !!d.is_auction,
    auctionStart: (d.auction_start == null ? null : Number(d.auction_start)),
    auctionIncrement: (d.auction_increment == null ? 1 : Number(d.auction_increment)),
    auctionEnds: d.auction_ends_at || null,
    auctionStatus: d.auction_status || 'live'
  };
}

// مزاد منتهٍ: انقضى وقته أو وُسِم كمنتهٍ → يُخفى من التطبيق الأساسي
function isAuctionEnded(l){
  if(!l || !l.isAuction) return false;
  if(l.auctionStatus && /end|clos|stop|finish|done|منته|انته|مغلق/i.test(l.auctionStatus)) return true;
  if(l.auctionEnds){ var t=new Date(l.auctionEnds).getTime(); if(!isNaN(t) && t<=Date.now()) return true; }
  return false;
}

async function loadAdsFromFirestore(filters = {}) {
  let q = supabaseClient.from('ads').select('*').eq('status', 'active');
  if (filters.category) q = q.eq('category', filters.category);
  if (filters.type) q = q.eq('type', filters.type);
  if (filters.featured) q = q.eq('featured', true);
  q = q.order('created_at', { ascending: false })
       .range(_adsOffset, _adsOffset + PAGE_SIZE - 1);
  const { data, error } = await q;
  if (error) { console.error('Supabase load error:', error); allLoaded = true; return []; }
  if (!data || data.length < PAGE_SIZE) allLoaded = true;
  _adsOffset += (data ? data.length : 0);
  return (data || []).map(mapRow).filter(function(l){ return !isAuctionEnded(l); });
}

async function loadMoreAds() {
  if (allLoaded) return;
  const btn = document.getElementById('loadMoreBtn');
  if (btn) { btn.textContent = 'جاري التحميل...'; btn.disabled = true; }
  const newAds = await loadAdsFromFirestore({ category: sC, type: sType, featured: sFeatured });
  listings.push(...newAds);
  renderListings();
  if (btn) { btn.textContent = 'تحميل المزيد'; btn.disabled = false; }
  if (allLoaded && btn) btn.style.display = 'none';
}

function resetPagination() {
  _adsOffset = 0;
  allLoaded = false;
}

async function searchFirestore(queryText) {
  const text = (queryText || '').trim();
  if (text.length < 2) return [];
  const pattern = '%' + text + '%';
  const { data, error } = await supabaseClient
    .from('ads').select('*').eq('status', 'active')
    .or(`title.ilike.${pattern},description.ilike.${pattern},location.ilike.${pattern}`)
    .limit(50);
  if (error) { console.error('Supabase search error:', error); return []; }
  let results = (data || []).map(mapRow).filter(function(l){ return !isAuctionEnded(l); });
  const keywords = text.toLowerCase().split(' ').filter(w => w.length > 1);
  if (keywords.length > 1) {
    results = results.filter(ad =>
      keywords.every(kw => (ad.title + ' ' + ad.desc + ' ' + ad.location).toLowerCase().includes(kw))
    );
  }
  return results;
}

async function incrementViews(adId) {
  if (!USE_FIREBASE) return;
  // عدّ المشاهدة مرة واحدة فقط لكل إعلان في الجلسة الواحدة لتقليل الكتابات
  try {
    const seen = JSON.parse(sessionStorage.getItem('tam_viewed') || '[]');
    if (seen.includes(adId)) return;
    seen.push(adId);
    sessionStorage.setItem('tam_viewed', JSON.stringify(seen));
  } catch(e) {}
  try { await supabaseClient.rpc('increment_views', { ad_id: adId }); } catch(e) {}
}

/* ===== DATA ===== */
const CATS=[
  {id:'apt-rent',label:'شقق للإيجار',type:'apartment',action:'rent',color:'#0D9488',img:'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=200&h=200&fit=crop'},
  {id:'apt-sale',label:'شقق للبيع',type:'apartment',action:'sale',color:'#000',img:'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=200&h=200&fit=crop'},
  {id:'car-rent',label:'سيارات للإيجار',type:'car',action:'rent',color:'#7C3AED',img:'cat-car.webp'},
  {id:'car-sale',label:'سيارات للبيع',type:'car',action:'sale',color:'#E11D48',img:'cat-car.webp'},
  {id:'equip-rent',label:'معدات للإيجار',type:'equipment',action:'rent',color:'#D97706',img:'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=200&h=200&fit=crop'},
  {id:'equip-sale',label:'معدات للبيع',type:'equipment',action:'sale',color:'#B45309',img:'https://images.unsplash.com/photo-1581094288338-2314dddb7ece?w=200&h=200&fit=crop'},
  {id:'shop-rent',label:'محلات تجارية للإيجار',type:'shop',action:'rent',color:'#2563EB',img:'cat-shop.png?v=5'},
  {id:'shop-sale',label:'محلات تجارية للبيع',type:'shop',action:'sale',color:'#1D4ED8',img:'cat-shop.png?v=5'},
  {id:'farm-rent',label:'أراضي للإيجار',type:'farm',action:'rent',color:'#16A34A',img:'cat-farm.png?v=8'},
  {id:'farm-sale',label:'أراضي للبيع',type:'farm',action:'sale',color:'#15803D',img:'cat-farm.png?v=8'},
  {id:'free-ad',label:'مهن وخدمات',type:'freead',action:'free',color:'#059669',img:'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=200&h=200&fit=crop'},
  {id:'find-partner',label:'ابحث عن شريك',type:'partner',action:'partner',color:'#F6921E',img:'https://images.unsplash.com/photo-1521791136064-7986c2920216?w=200&h=200&fit=crop'}
];
const CITIES=['جبلة','اللاذقية','أخرى'];
const NEIGHBORHOODS={'جبلة':['حي العمارة','حي العزي','حي الدريبة','حي القلعة','حي السوق (المدينة القديمة)','حي الفيض','حي جبيبات شرقية','حي جبيبات غربية','حي النقعة','حي الميناء','حي الكورنيش','حي التغرة','حي الجركس','حي جب جويخة','المتحلق','حي الصليبة','حي المهجع','حي المفيض','ضاحية المجد'],'اللاذقية':['حي العمارة','حي العزي','حي الدريبة','حي القلعة','حي السوق (المدينة القديمة)','حي الفيض','حي جبيبات شرقية','حي جبيبات غربية','حي النقعة','حي الميناء','حي الكورنيش','حي التغرة','حي الجركس','حي جب جويخة','المتحلق','حي الصليبة','حي المهجع','حي المفيض','ضاحية المجد']};
const LOCS=NEIGHBORHOODS['جبلة'];
const LOC_COORDS={
  'حي العمارة':{lat:35.3614,lng:35.9264},
  'حي العزي':{lat:35.3620,lng:35.9270},
  'حي الدريبة':{lat:35.3608,lng:35.9255},
  'حي القلعة':{lat:35.3625,lng:35.9250},
  'حي السوق (المدينة القديمة)':{lat:35.3612,lng:35.9260},
  'حي الفيض':{lat:35.3630,lng:35.9280},
  'حي جبيبات شرقية':{lat:35.3640,lng:35.9300},
  'حي جبيبات غربية':{lat:35.3635,lng:35.9285},
  'حي النقعة':{lat:35.3605,lng:35.9240},
  'حي الميناء':{lat:35.3575,lng:35.9195},
  'حي الكورنيش':{lat:35.3580,lng:35.9200},
  'حي التغرة':{lat:35.3650,lng:35.9310},
  'حي الجركس':{lat:35.3660,lng:35.9320},
  'حي جب جويخة':{lat:35.3645,lng:35.9295},
  'المتحلق':{lat:35.3670,lng:35.9335},
  'حي الصليبة':{lat:35.3600,lng:35.9230},
  'حي المهجع':{lat:35.3680,lng:35.9345},
  'حي المفيض':{lat:35.3690,lng:35.9355},
  'ضاحية المجد':{lat:35.3710,lng:35.9380},
};
const MONTHS=['كانون الثاني','شباط','آذار','نيسان','أيار','حزيران','تموز','آب','أيلول','تشرين الأول','تشرين الثاني','كانون الأول'];
const DAYS=['أحد','إثنين','ثلاثاء','أربعاء','خميس','جمعة','سبت'];

const HERO_IMGS=[
  'hero1.webp',
  'hero2.webp',
  'hero3.webp',
  'hero3.webp'
];

const APT_IMGS=[
  'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=600&h=400&fit=crop'
];
const CAR_IMGS=[
  'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1553440569-bcc63803a83d?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=600&h=400&fit=crop'
];
const EQUIP_IMGS=[
  'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1581094288338-2314dddb7ece?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1572981779307-38b8cabb2407?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=600&h=400&fit=crop'
];
const FREEAD_IMGS=[
  'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=600&h=400&fit=crop'
];
const SHOP_IMGS=[
  'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1567449303078-57ad995bd17a?w=600&h=400&fit=crop'
];
const FARM_IMGS=[
  'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=600&h=400&fit=crop'
];

let listings=[]


let _usdRate = 0;   // سعر صرف الدولار (يحدّثه الأدمن يومياً، يُطبَّق داخل كل إعلان)
let sFreeGroup = null;   // تبويب مهن وخدمات: null=الكل · handy=خدمات مهنية · home=أسر منتجة
let sC=null, sType=null, sQ='', sFeatured=false, sFav=false, sDiscount=false, carouselTimers=[];

// تقسيم الإعلانات المجانية إلى مجموعتين (يُشتقّ من المهنة — بلا تعديل قاعدة البيانات)
const FREE_HANDY = ['كهربائي','سباك','دهان','نجار','لحام','ميكانيكي','حداد','عامل بناء','تركيب','توصيل','سيارة نقل صغيرة','حلّاق','عامل','دروس خصوصية','مدرس'];
const FREE_HOME  = ['طبخ منزلي','تنظيف منازل','غسيل وكي','رعاية أطفال','رعاية مسنّين','خياطة منزلية','ترتيب البيت'];
function freeGroup(l){
  if(l && (l.freeGroup==='home' || l.freeGroup==='handy')) return l.freeGroup;   // اختيار الأدمن الصريح أولاً
  const p = (l && l.profession) || '';
  if(FREE_HOME.includes(p)) return 'home';
  return 'handy';   // احتياط للإعلانات القديمة بلا مجموعة محفوظة
}
function setFreeGroup(g){ sFreeGroup = g; renderListings(true); }
window.setFreeGroup = setFreeGroup;

/* ===== المفضّلة (تُحفظ محلياً) ===== */
function getFavs(){ try{ return JSON.parse(localStorage.getItem('tam_favs')||'[]').map(String); }catch(e){ return []; } }
function isFav(id){ return getFavs().includes(String(id)); }
function toggleFav(id, ev){
  if(ev){ ev.stopPropagation(); ev.preventDefault(); }
  // المفضلة للمستخدمين المسجّلين فقط — الزائر يتصفّح فقط
  if(typeof window.isLoggedIn==='function' && !window.isLoggedIn()){
    if(typeof window._acOpenAuth==='function') window._acOpenAuth();
    return;
  }
  var favs=getFavs(), sid=String(id), i=favs.indexOf(sid);
  if(i>-1) favs.splice(i,1); else favs.push(sid);
  localStorage.setItem('tam_favs', JSON.stringify(favs));
  document.querySelectorAll('.fav-btn[data-id="'+id+'"]').forEach(function(b){ b.classList.toggle('on', isFav(id)); });
  updateFavCount();
}
function updateFavCount(){
  var n=getFavs().length;
  document.querySelectorAll('.fav-count').forEach(function(e){ e.textContent=n; e.style.display=n>0?'inline-flex':'none'; });
}
function showFavorites(){
  // قسم المفضلة للمستخدمين المسجّلين فقط
  if(typeof window.isLoggedIn==='function' && !window.isLoggedIn()){
    if(typeof window._acOpenAuth==='function') window._acOpenAuth();
    return;
  }
  sFav=true; sDiscount=false; sC=null; sType=null; sFeatured=false; sQ=''; nav('listings');
}
// قسم التخفيضات: كل الإعلانات التي عليها خصم (مع إمكانية الفلترة كباقي الأقسام)
function showDiscounts(){ navTab('discounts'); }
var ICON_HEART='<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
let calY,calM,_calStart=null,_calEnd=null,_calPrice=0;

const getCat=id=>CATS.find(c=>c.id===id);
const isApt=id=>getCat(id)?.type==='apartment';
const isEquip=id=>getCat(id)?.type==='equipment';
const isCar=id=>getCat(id)?.type==='car';
const isFreeAd=id=>getCat(id)?.type==='freead';
const isShop=id=>getCat(id)?.type==='shop';
const isFarm=id=>getCat(id)?.type==='farm';
const isPartner=id=>getCat(id)?.type==='partner';
const isRent=id=>id?.includes('rent');
function typeToTab(t){return t==='apartment'?'apts':t==='car'?'cars':t==='equipment'?'equips':t==='shop'?'shops':t==='farm'?'farms':t==='freead'?'freeads':t==='partner'?'partners':'all-listings';}

/* ===== التقييم (يُدار من الأدمن فقط) + الخصم ===== */
const STAR_SVG='<svg viewBox="0 0 24 24" class="rt-s"><path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77 5.82 21l1.18-6.88-5-4.87 7.1-1.01L12 2z"/></svg>';
function ratingHTML(r,cls){
  if(r==null||isNaN(r)||r<=0) return '';
  const val=Math.round(Number(r)*10)/10, filled=Math.round(val);
  let s='';
  for(let i=1;i<=5;i++) s+='<span class="rt-s-w'+(i<=filled?' on':'')+'">'+STAR_SVG+'</span>';
  return '<div class="rt '+(cls||'')+'">'+s+'<span class="rt-v">'+val+'</span></div>';
}
function discountPct(l){
  return (l && l.oldPrice!=null && l.oldPrice>l.price && l.price>0) ? Math.round((1-l.price/l.oldPrice)*100) : 0;
}
/* تضمين فيديو يوتيوب / فيسبوك من رابط */
function videoEmbedHTML(url){
  if(!url) return '';
  url=String(url).trim();
  var fsBtn='<button class="gd-vid-fs" onclick="vidFullscreen(this)" title="تكبير الفيديو" aria-label="تكبير"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg></button>';
  var yt=url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|v\/)|youtu\.be\/)([\w-]{11})/);
  if(yt) return '<div class="gd-video"><iframe src="https://www.youtube.com/embed/'+yt[1]+'" title="فيديو" frameborder="0" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowfullscreen loading="lazy"></iframe>'+fsBtn+'</div>';
  if(/facebook\.com|fb\.watch/i.test(url)) return '<div class="gd-video"><iframe src="https://www.facebook.com/plugins/video.php?show_text=false&href='+encodeURIComponent(url)+'" title="فيديو" frameborder="0" allow="autoplay;clipboard-write;encrypted-media;picture-in-picture;web-share" allowfullscreen loading="lazy" scrolling="no"></iframe>'+fsBtn+'</div>';
  return '';
}
// تكبير الفيديو (ملء الشاشة)
function vidFullscreen(btn){
  var c=btn.closest('.gd-video'); if(!c) return;
  var el=c.querySelector('iframe')||c;
  var fn=el.requestFullscreen||el.webkitRequestFullscreen||el.webkitEnterFullscreen||el.msRequestFullscreen||c.requestFullscreen||c.webkitRequestFullscreen;
  try{ fn.call(el.requestFullscreen?el:c); }catch(e){ try{ c.requestFullscreen&&c.requestFullscreen(); }catch(_){} }
}
window.vidFullscreen=vidFullscreen;

// خلط إعلانات مجانية بشكل دوري — كل N إعلان عادي يظهر إعلان مجاني
function mixFreeAds(mainItems, freeItems, every=3){
  if(!freeItems.length) return mainItems;
  const result=[];
  let freeIdx=0;
  mainItems.forEach((item,i)=>{
    result.push(item);
    if((i+1)%every===0 && freeIdx<freeItems.length){
      result.push(freeItems[freeIdx++]);
    }
  });
  // أضف أي إعلانات مجانية متبقية بالنهاية
  while(freeIdx<freeItems.length) result.push(freeItems[freeIdx++]);
  return result;
}
const fmtPrice=(p,long)=>{
  if(!p && p!==0) return '';
  const unit = long ? ' ل.س جديدة' : ' ل.س.ج';
  return '\u200F' + Number(p).toLocaleString('en-US') + unit;
};

/* ===== SVG ICONS ===== */
function esc(str){
  if(!str && str!==0) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
const ICON={
  bed:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 012 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>',
  bath:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16a1 1 0 011 1v3a4 4 0 01-4 4H7a4 4 0 01-4-4v-3a1 1 0 011-1z"/><path d="M6 12V5a2 2 0 012-2h3v2.25"/></svg>',
  area:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>',
  tree:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17Z"/><path d="M12 22v-3"/></svg>',
  floors:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/></svg>',
  car:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.54 9.43l-1.28-3.84A2 2 0 0017.36 4H6.64a2 2 0 00-1.9 1.59L3.46 9.43A2 2 0 003 10.86V17a1 1 0 001 1h1a2 2 0 004 0h6a2 2 0 004 0h1a1 1 0 001-1v-6.14a2 2 0 00-.46-1.43z"/><circle cx="6.5" cy="14.5" r="1.5"/><circle cx="17.5" cy="14.5" r="1.5"/><path d="M5.41 10l.96-2.88A1 1 0 017.32 6.5h9.36a1 1 0 01.95.62L18.59 10H5.41z"/><line x1="7" y1="4.5" x2="17" y2="4.5"/></svg>',
  model:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
  year:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  km:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  pin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  wa:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>',
  cal:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  chevL:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>',
  chevR:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>',
  back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
  kitchen:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>',
  balcony:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13h18"/><path d="M5 13v8"/><path d="M19 13v8"/><path d="M12 13v8"/><path d="M3 21h18"/><path d="M6 3v4"/><path d="M18 3v4"/><rect x="4" y="7" width="16" height="6" rx="2"/></svg>',
  living:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 9V6a2 2 0 00-2-2H6a2 2 0 00-2 2v3"/><path d="M2 11v5a2 2 0 002 2h16a2 2 0 002-2v-5a2 2 0 00-4 0v2H6v-2a2 2 0 00-4 0z"/><path d="M4 18v2"/><path d="M20 18v2"/></svg>',
  storage:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
	  share:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
	  color:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/></svg>',
	  type:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 00-.48-.41h-3.84a.48.48 0 00-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87a.48.48 0 00.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.26.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58z"/><circle cx="12" cy="12" r="3"/></svg>',
	  prev:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>',
	  next:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>',
	};

/* ===== CAROUSEL ===== */
function clearTimers(){carouselTimers.forEach(t=>clearInterval(t));carouselTimers=[];clearInterval(featScrollTimer);}
function initCarousels(container){
  container.querySelectorAll('.l-img, .det-gallery').forEach(cr=>{
    const imgs=cr.querySelectorAll('img'),dots=cr.querySelectorAll('.l-dots span');
    if(imgs.length<=1)return;
    let cur=0;
    const total=imgs.length;
    const show=i=>{
      cur=((i%total)+total)%total;
      imgs.forEach((m,j)=>m.classList.toggle('act',j===cur));
      dots.forEach((d,j)=>d.classList.toggle('act',j===cur));
    };
    // Auto rotate
    let t=setInterval(()=>show(cur+1),3500);
    carouselTimers.push(t);
    // Touch swipe - skip for cards inside #featScroll (let container scroll)
    const inFeatScroll=cr.closest('#featScroll');
    if(!inFeatScroll){
      let startX=0,startY=0,isDragging=false,direction=null;
      cr.addEventListener('touchstart',e=>{startX=e.touches[0].clientX;startY=e.touches[0].clientY;isDragging=true;direction=null;},{passive:true});
      cr.addEventListener('touchmove',e=>{
        if(!isDragging)return;
        const dx=Math.abs(e.touches[0].clientX-startX);
        const dy=Math.abs(e.touches[0].clientY-startY);
        if(!direction&&(dx>12||dy>12)){direction=dx>dy?'h':'v';}
        if(direction==='h')e.preventDefault();
      },{passive:false});
      cr.addEventListener('touchend',e=>{
        if(!isDragging)return;isDragging=false;
        if(direction!=='h')return;
        const diff=startX-e.changedTouches[0].clientX;
        if(Math.abs(diff)>55){
          clearInterval(t);
          if(diff>0)show(cur+1); else show(cur-1);
        }
        // إذا ما كانت swipe حقيقية، خليها click تكمل
        direction=null;
      },{passive:true});
    }
    // Click on dots
    dots.forEach((d,j)=>d.onclick=e=>{e.stopPropagation();show(j);});
  });
}

/* ===== HERO CAROUSEL ===== */
let heroIdx=0,heroTimer,heroSwipeInit=false;
function updateHeroSlide(){
  const bg=document.getElementById('heroBg');
  const dots=document.getElementById('heroDots');
  bg.querySelectorAll('img').forEach((img,i)=>img.classList.toggle('active',i===heroIdx));
  dots.querySelectorAll('span').forEach((d,i)=>d.classList.toggle('active',i===heroIdx));
}
function startHeroAuto(){
  clearInterval(heroTimer);
  heroTimer=setInterval(()=>{
    heroIdx=(heroIdx+1)%HERO_IMGS.length;
    updateHeroSlide();
  },7000);
}
function initHero(){
  const bg=document.getElementById('heroBg');
  const dots=document.getElementById('heroDots');
  bg.innerHTML=HERO_IMGS.map((src,i)=>`<img src="${src}" alt="" class="${i===0?'active':''}" ${i>0?'loading="lazy"':''}>`).join('');
  dots.innerHTML=HERO_IMGS.map((_,i)=>`<span class="${i===0?'active':''}"></span>`).join('');
  startHeroAuto();
  if(!heroSwipeInit){
    heroSwipeInit=true;
    const heroEl=document.querySelector('.hero');
    let hStartX=0,hStartY=0,swiping=false;
    heroEl.addEventListener('touchstart',e=>{
      hStartX=e.touches[0].clientX;
      hStartY=e.touches[0].clientY;
      swiping=true;
    },{passive:true});
    heroEl.addEventListener('touchmove',e=>{
      if(!swiping)return;
      const dx=Math.abs(e.touches[0].clientX-hStartX);
      const dy=Math.abs(e.touches[0].clientY-hStartY);
      if(dx>dy&&dx>15){e.preventDefault();}
    },{passive:false});
    heroEl.addEventListener('touchend',e=>{
      if(!swiping)return;
      swiping=false;
      const diff=hStartX-e.changedTouches[0].clientX;
      if(Math.abs(diff)>30){
        clearInterval(heroTimer);
        heroIdx=diff>0?(heroIdx+1)%HERO_IMGS.length:(heroIdx-1+HERO_IMGS.length)%HERO_IMGS.length;
        updateHeroSlide();
      }
    },{passive:true});
  }
}

/* ===== RENDER CARD ===== */
function renderCard(l,i,mode){
  const cat=getCat(l.catId),apt=isApt(l.catId),equip=isEquip(l.catId),rent=isRent(l.catId),freead=isFreeAd(l.catId),shop=isShop(l.catId),farm=isFarm(l.catId),partner=isPartner(l.catId);
  const noCom=freead||partner;   // أقسام بلا سعر/مزاد/خصم/تقييم
  // الإعلان بلا صور لا تُوضع له صورة وهمية — يُعرض بدون صورة
  const imgs=l.images?.length?l.images:[];

  let specs='';
  if(apt){
    specs=`<div class="l-spec">${ICON.bed} ${l.rooms||'—'} غرف</div><div class="l-spec">${ICON.bath} ${l.baths||'—'} حمام</div><div class="l-spec">${ICON.area} ${l.area||'—'} م²</div>`;
  }else if(equip || freead || partner){
    specs='';
  }else{
    specs=`<div class="l-spec">${ICON.car} ${l.carType||'—'} ${l.carModel||''}</div><div class="l-spec">${ICON.year} ${l.carYear||'—'}</div>${rent?'':`<div class="l-spec">${ICON.km} ${l.carKm?l.carKm.toLocaleString()+' كم':'—'}</div>`}`;
  }
  
  const imgHTML=imgs.map((s,j)=>`<img src="${s}" alt="${esc(l.title)}" class="${j===0?'act':''}" loading="lazy">`).join('');
  const dotsHTML=imgs.length>1?`<div class="l-dots">${imgs.map((_,j)=>`<span class="${j===0?'act':''}"></span>`).join('')}</div>`:'';
  let badgeClass=l.catId==='apt-rent'?'rent':l.catId==='apt-sale'?'sale':l.catId==='car-rent'?'car-r':l.catId==='car-sale'?'car-s':l.catId==='equip-rent'?'equip-r':l.catId==='free-ad'?'free-ad':l.catId==='shop-rent'?'shop-r':l.catId==='shop-sale'?'shop-s':l.catId==='farm-rent'?'farm-r':l.catId==='farm-sale'?'farm-s':'equip-s';
  let badgeLabel=cat?cat.label:'';
  if(badgeLabel.includes('للإيجار')) badgeLabel='إيجار';
  else if(badgeLabel.includes('للبيع')) badgeLabel='بيع';
  if(l.isAuction) badgeLabel='مزاد';
  
  const showBadge=!noCom;

  // لا شارة على صورة الإعلان المجاني (كلمة "إعلان" تظهر أسفل الكرت فقط)
  const freeAdBadge='';

  // الخصم الحقيقي (محسوب من السعر قبل وبعد)
  const _pct=discountPct(l);
  // شريط خصم على الصورة (يظهر في الإعلانات المميزة فقط عبر CSS)
  const discountBadge=(!noCom && _pct>0)?`<span class="l-ribbon">${_pct}%</span>`:'';
  const discountChip=(!noCom && _pct>0)?`<span class="l-disc">${_pct}%</span>`:'';

  // ===== تقييم (الرقم بين قوسين) + خصم على نفس الصف — لا تقييم للإعلان المجاني =====
  const ratingRow=(!noCom && l.rating!=null && l.rating>0)
    ? `<div class="l-rating">${STAR_SVG}<span class="lr-v">(${Math.round(l.rating*10)/10})</span><span class="lr-l">تقييم</span></div>`
    : '';
  // للمزاد الجاري: شريحة «زايد الآن» في يسار الصف بدل شريحة الخصم
  const bidNowChip=(l.isAuction && !isAuctionEnded(l))?`<span class="l-bidnow">زايد الآن</span>`:'';
  const leftChip=bidNowChip||discountChip;
  const topRow=(ratingRow||leftChip)?`<div class="l-toprow">${ratingRow||'<span></span>'}${leftChip}</div>`:'';

  // ===== المرافق بالشكل الأصلي (SVG رمادي صغير) كشريط يتحرّك عند المرور إن كثُرت =====
  let _pills='';
  if(apt){
    const ps=[];
    if(l.area)      ps.push(`<div class="l-spec">${ICON.area}<span>${l.area} م²</span></div>`);
    if(l.rooms)     ps.push(`<div class="l-spec">${ICON.bed}<span>${l.rooms}</span></div>`);
    if(l.baths)     ps.push(`<div class="l-spec">${ICON.bath}<span>${l.baths}</span></div>`);
    if(l.kitchens)  ps.push(`<div class="l-spec">${ICON.kitchen}<span>${l.kitchens}</span></div>`);
    if(l.living)    ps.push(`<div class="l-spec">${ICON.living}<span>${l.living}</span></div>`);
    if(l.balconies) ps.push(`<div class="l-spec">${ICON.balcony}<span>${l.balconies}</span></div>`);
    _pills=ps.join('');
  }else if(shop){
    const ps=[];
    if(l.shopArea)   ps.push(`<div class="l-spec">${ICON.area}<span>${l.shopArea} م²</span></div>`);
    if(l.shopFloor)  ps.push(`<div class="l-spec">${ICON.storage}<span>${esc(l.shopFloor)}</span></div>`);
    if(l.shopFronts) ps.push(`<div class="l-spec">${ICON.model}<span>${l.shopFronts} واجهة</span></div>`);
    _pills=ps.join('');
  }else if(farm){
    const ps=[];
    if(l.farmType)  ps.push(`<div class="l-spec">${ICON.storage}<span>${esc(l.farmType)}</span></div>`);
    if(l.farmArea)  ps.push(`<div class="l-spec">${ICON.area}<span>${l.farmArea} م²</span></div>`);
    if(l.farmTrees) ps.push(`<div class="l-spec">${ICON.tree}<span>${l.farmTrees} شجرة</span></div>`);
    _pills=ps.join('');
  }else if(partner){
    const ps=[];
    if(l.partnerSector) ps.push(`<div class="l-spec">${ICON.storage}<span>${esc(l.partnerSector)}</span></div>`);
    if(l.partnerSeek)   ps.push(`<div class="l-spec">${ICON.model}<span>يطلب: ${esc(l.partnerSeek)}</span></div>`);
    _pills=ps.join('');
  }else if(!equip && !freead && !partner){
    const ps=[];
    if(l.carYear) ps.push(`<div class="l-spec">${ICON.year}<span>${l.carYear}</span></div>`);
    if(l.carColor) ps.push(`<div class="l-spec">${ICON.color}<span>${esc(l.carColor)}</span></div>`);
    if(l.carKm && !rent) ps.push(`<div class="l-spec">${ICON.km}<span>${l.carKm.toLocaleString()}</span></div>`);
    _pills=ps.join('');
  }
  const pillsBlock=_pills?`<div class="l-specs"><div class="l-specs-inner">${_pills}</div></div>`:'';
  let priceBlock='';
  if(partner){
    priceBlock=`<div class="l-adword">${esc(l.partnerOffer||'شراكة')}</div>`;
  }else if(freead){
    priceBlock=`<div class="l-adword">${esc(l.profession||'خدمة')}</div>`;
  }else if(l.isAuction){
    // المزاد: مؤقّت + المزايدة الحالية + عدد المزايدين (بدل السعر)
    const _b=(window._aucCardBids&&window._aucCardBids[l.id])||null;
    const _cur=(_b&&_b.max)|| l.auctionStart || l.price || 0;
    const _cnt=(_b&&_b.count)||0;
    priceBlock=`<div class="l-auc-info">
      <div class="l-auc-timer" data-ends="${l.auctionEnds||''}">${_aucTimerHTML(l.auctionEnds)}</div>
      <div class="l-auc-row">
        <div class="l-auc-stat"><b class="l-auc-cur" data-aid="${l.id}">${fmtPrice(_cur)}</b><small>المزايدة الحالية</small></div>
        <div class="l-auc-stat"><b class="l-auc-bidders" data-aid="${l.id}">${_cnt}</b><small>عدد المزايدين</small></div>
      </div>
    </div>`;
  }else{
    const hasDisc=_pct>0;
    const oldHTML=hasDisc?`<span class="l-old">${Number(l.oldPrice).toLocaleString('en-US')}</span> `:'';
    const perTxt=rent?`<span class="l-per">/ يوم</span>`:'';
    const adType=rent?'للإيجار':(l.isAuction?'مزاد':'للبيع');
    if(rent && !hasDisc){
      // إيجار بلا سعر مشطوب: "/ يوم" بجانب ل.س.ج على نفس السطر، والنوع تحته
      priceBlock=`<div class="l-priceb"><span class="l-pricewrap"><span class="l-price">${fmtPrice(l.price)}</span>${perTxt}</span><span class="l-pmeta"><span class="l-type">${adType}</span></span></div>`;
    }else{
      // خصم (أو بيع): السعر بالأعلى، و"/ يوم" + النوع بالأسفل (لتفادي قطع "يوم")
      priceBlock=`<div class="l-priceb"><span class="l-pricewrap">${oldHTML}<span class="l-price">${fmtPrice(l.price)}</span></span><span class="l-pmeta">${perTxt}<span class="l-type">${adType}</span></span></div>`;
    }
  }

  const featHTML='';

  // Free ads: 1 image only
  const cardImgs=noCom?imgs.slice(0,1):imgs;
  const cardImgHTML=cardImgs.map((s,j)=>`<img src="${s}" alt="${esc(l.title)}" class="${j===0?'act':''}" loading="lazy">`).join('');
  const cardDotsHTML=cardImgs.length>1?`<div class="l-dots">${cardImgs.map((_,j)=>`<span class="${j===0?'act':''}"></span>`).join('')}</div>`:'';
  const favHTML=`<button class="card-fav fav-btn${isFav(l.id)?' on':''}" data-id="${l.id}" onclick="toggleFav('${l.id}',event)" aria-label="مفضلة">${ICON_HEART}</button>`;
  // شارة «مباشر» مع نقطة حمراء متوهّجة — أعلى يسار كرت المزاد الجاري
  const liveBadge=(l.isAuction && !isAuctionEnded(l))?`<span class="l-live"><i></i>مباشر</span>`:'';

  const descHTML=l.desc?`<div class="l-desc">${esc(l.desc).split('\n')[0]}</div>`:'';
  
  // Free ad profession badge
  const professionHTML='';
  
  // Location display: neighborhood / city
  const locDisplay = l.city && l.neighborhood ? `${esc(l.neighborhood)} / ${esc(l.city)}` : (l.location ? esc(l.location) : 'جبلة');

  const cardBody=`<div class="l-body" style="direction:rtl;text-align:right">${topRow}${pillsBlock}<div class="l-title">${esc(l.title)}</div><div class="l-loc">${ICON.pin}${locDisplay}</div>${priceBlock}</div>`;

  // بلا صورة: لا نعرض حاوية الصورة إطلاقاً (الكرت نصّي فقط) — مع إبقاء زر المفضّلة في الزاوية
  const imgBlock=cardImgHTML
    ? `<div class="l-img">${cardImgHTML}${cardDotsHTML}${liveBadge}${featHTML}${freeAdBadge}${discountBadge}${favHTML}</div>`
    : `<div class="l-noimg">${favHTML}</div>`;

  if(mode==='full'){
    return `<div class="l-card-full af s${Math.min((i%5)+1,5)}" style="direction:rtl" onclick="event.stopPropagation();viewDetail('${l.id}')">
      ${imgBlock}
      ${cardBody}
    </div>`;
  }

  return `<div class="l-card af s${Math.min((i%5)+1,5)}" style="direction:rtl" onclick="event.stopPropagation();viewDetail('${l.id}')">
    ${imgBlock}
    ${cardBody}
  </div>`;
}

/* ===== شريط العروض: بطاقة تعرض إعلاناً واحداً يتبدّل كل ثانيتين بتأثير ناعم =====
   يعمل بنفس الشكل على الموبايل واللابتوب، والضغط يفتح الإعلان الظاهر حالياً. */
var _ntItems=[], _ntIdx=0, _ntTimer=null;
function renderNewsTicker(discItems){
  var tk=document.getElementById('newsTicker'); if(!tk) return;
  var cur=document.getElementById('newsTickerCurrent'); if(!cur) return;
  _ntItems=[];
  listings.filter(function(l){ return l.isAuction && !isFreeAd(l.catId) && !isPartner(l.catId); })
    .forEach(function(l){ _ntItems.push({c:'auc', t:'مزاد مفتوح — '+(l.title||'إعلان')+' · زايد الآن', id:l.id}); });
  (discItems||[]).forEach(function(l){ var p=discountPct(l); if(p>0) _ntItems.push({c:'disc', t:'خصم '+p+'٪ — '+(l.title||'إعلان'), id:l.id}); });
  if(_ntTimer){ clearInterval(_ntTimer); _ntTimer=null; }
  if(!_ntItems.length){ tk.style.display='none'; cur.innerHTML=''; return; }
  tk.style.display='';
  _ntIdx=0; _ntShow(0);
  if(_ntItems.length>1){ _ntTimer=setInterval(function(){ _ntIdx=(_ntIdx+1)%_ntItems.length; _ntShow(_ntIdx); }, 2000); }
}
function _ntShow(i){
  var cur=document.getElementById('newsTickerCurrent'); if(!cur) return;
  var it=_ntItems[i]; if(!it) return;
  cur.style.opacity='0';                 // تلاشٍ ثم تبديل النص ثم ظهور
  setTimeout(function(){
    cur.className='nt-current nt-'+it.c;
    cur.innerHTML='<span class="nt-dot"></span>'+esc(it.t);
    cur.setAttribute('data-id', String(it.id));
    cur.style.opacity='1';
  }, 220);
}
window._ntOpen=function(){
  var it=_ntItems[_ntIdx]; if(it && it.id!=null && typeof viewDetail==='function') viewDetail(it.id);
};

/* ===== بطاقة المزاد الخارجية: عدد المزايدين + أعلى مزايدة + مؤقّت حيّ ===== */
async function loadAuctionBidSummaries(){
  try{
    var ids = listings.filter(function(l){ return l.isAuction; }).map(function(l){ return l.id; });
    if(!ids.length){ window._aucCardBids={}; return; }
    var r = await supabaseClient.from('bids').select('ad_id,amount').in('ad_id', ids);
    var map={};
    (r.data||[]).forEach(function(b){ var k=b.ad_id; if(!map[k])map[k]={count:0,max:0}; var amt=Number(b.amount)||0; map[k].count++; if(amt>map[k].max)map[k].max=amt; });
    window._aucCardBids=map;
    _updateAuctionCards();
  }catch(e){}
}
function _updateAuctionCards(){
  var m=window._aucCardBids||{};
  document.querySelectorAll('.l-auc-cur[data-aid]').forEach(function(el){
    var id=el.getAttribute('data-aid'); var b=m[id];
    var l=listings.find(function(x){ return String(x.id)===id; });
    var cur=(b&&b.max)|| (l&&(l.auctionStart||l.price)) ||0;
    el.textContent=fmtPrice(cur);
  });
  document.querySelectorAll('.l-auc-bidders[data-aid]').forEach(function(el){
    var b=m[el.getAttribute('data-aid')]; el.textContent=(b&&b.count)||0;
  });
}
var _AUC_CLOCK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 1.8"/></svg>';
function _aucTimerHTML(ends){
  if(!ends) return _AUC_CLOCK+'<span>مزاد مفتوح</span>';
  var d=new Date(ends).getTime()-Date.now();
  if(d<=0) return _AUC_CLOCK+'<span>انتهى المزاد</span>';
  var dd=Math.floor(d/864e5), hh=Math.floor(d%864e5/36e5), mm=Math.floor(d%36e5/6e4), ss=Math.floor(d%6e4/1e3);
  var t=(dd>0?dd+'ي ':'')+String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0')+':'+String(ss).padStart(2,'0');
  return _AUC_CLOCK+'<span>'+t+'</span>';
}
// مؤقّت حيّ يحدّث كل بطاقات المزاد الظاهرة كل ثانية
setInterval(function(){
  var els=document.querySelectorAll('.l-auc-timer[data-ends]');
  for(var i=0;i<els.length;i++){ els[i].innerHTML=_aucTimerHTML(els[i].getAttribute('data-ends')); }
}, 1000);

/* ===== التصنيفات الدائرية: مجموعة واحدة فقط (بلا تكرار) =====
   تنساب تلقائياً مرّة واحدة حتى آخر تصنيف ثم تتوقّف، ويبقى السحب اليدوي متاحاً.
   تُدار عبر translateX (مستقلّة عن اتجاه RTL، تعمل على iOS وأندرويد). */
function initCatScroll(){
  var grid = document.getElementById('catGrid'); if(!grid) return;
  if(grid._catInit){ if(grid._catReset) grid._catReset(); return; }  // إعادة عرض → أعد الضبط فقط
  grid._catInit = true;

  var track=null, tx=0, maxS=0, autoDone=false;
  var dragging=false, startX=0, startTx=0, moved=false;

  function _catMobile(){ return window.innerWidth <= 767; }   // الحركة/السحب على الهاتف فقط (التابلت+اللابتوب ثابتة)
  function _catPortrait(){ return window.innerHeight >= window.innerWidth; }  // الحركة التلقائية بالوضع الطولي فقط
  function getTrack(){ return grid.querySelector('.cat-track'); }
  function clamp(){ if(tx<0) tx=0; if(tx>maxS) tx=maxS; }
  function apply(){ if(track) track.style.transform='translateX('+tx+'px)'; }
  function measure(){ track=getTrack(); maxS = track ? Math.max(0, track.scrollWidth - grid.clientWidth) : 0; clamp(); }
  function reset(){ tx=0; autoDone=false; dragging=false; measure(); apply(); }   // عند إعادة العرض
  grid._catReset = reset;

  function step(){
    var t=getTrack();
    if(t!==track){ track=t; tx=0; autoDone=false; measure(); apply(); }  // تغيّر الـ track → أعد الضبط
    // حركة تلقائية فقط على الهاتف بالوضع الطولي (حيث لا تتّسع التصنيفات) — لا حركة أبداً بالعرض
    if(!dragging && !autoDone && maxS>2 && _catMobile() && _catPortrait()){
      tx += 0.4;                                   // انسياب لطيف نحو آخر تصنيف
      if(tx>=maxS){ tx=maxS; autoDone=true; }      // وصل للنهاية → أوقف التلقائي (يدوي فقط بعدها)
      apply();
    }
    requestAnimationFrame(step);
  }

  function down(x){ if(!_catMobile()) return; measure(); if(maxS<=2) return; dragging=true; moved=false; startX=x; startTx=tx; }
  function move(x){ if(!dragging) return; var dx=x-startX; if(Math.abs(dx)>4) moved=true; tx=startTx+dx; clamp(); apply(); }
  function up(){ dragging=false; }

  grid.addEventListener('touchstart', function(e){ down(e.touches[0].clientX); }, {passive:true});
  grid.addEventListener('touchmove',  function(e){ move(e.touches[0].clientX); }, {passive:true});
  grid.addEventListener('touchend',   up, {passive:true});
  grid.addEventListener('mousedown',  function(e){ down(e.clientX); });
  window.addEventListener('mousemove', function(e){ move(e.clientX); });
  window.addEventListener('mouseup',   up);
  function _catRelayout(){ if(!_catMobile() || !_catPortrait()){ tx=0; autoDone=false; } measure(); apply(); }
  window.addEventListener('resize', _catRelayout);
  window.addEventListener('orientationchange', function(){ setTimeout(_catRelayout, 120); });
  // امنع فتح التصنيف إذا كان المستخدم يسحب (وليس نقرة)
  grid.addEventListener('click', function(e){ if(moved){ e.stopPropagation(); e.preventDefault(); moved=false; } }, true);

  measure(); apply();
  requestAnimationFrame(step);
}

/* ===== المرافق: شريط بحلقة متصلة عند مرور الفأرة (فقط إن كانت أكثر من 3) ===== */
document.addEventListener('mouseover', function(e){
  var t=e.target; if(!t||!t.closest) return;
  var card=t.closest('.l-card,.l-card-full'); if(!card) return;
  var sp=card.querySelector('.l-specs'); if(!sp || sp.dataset.mqDone) return;
  sp.dataset.mqDone='1';
  var inner=sp.querySelector('.l-specs-inner'); if(!inner) return;
  if(inner.children.length<=3) return;             // 3 مرافق أو أقل: لا تتحرّك
  var over=inner.scrollWidth - sp.clientWidth;      // مقدار التجاوز عن عرض الكرت
  if(over<=4) return;
  inner.style.setProperty('--shift',(over+6)+'px'); // يمشي لآخر المرافق فقط ثم يتوقّف
  inner.style.animationDuration=Math.max(5,(over/22)).toFixed(1)+'s'; // أبطأ
  sp.classList.add('mq');
});

/* ===== NAVIGATION ===== */
let _activeTab='home';
let _navHistory=[];
let _skipPush=false;

// ===== NAVIGATION STACK =====
// stack داخلي لتتبع كل الصفحات المزارة
const _navStack = [];

function _navPush(state) {
  // احفظ الـ scroll الحالي على آخر عنصر بالـ stack قبل إضافة الصفحة الجديدة
  if (_navStack.length > 0) {
    _navStack[_navStack.length - 1].scrollPos = window.pageYOffset || document.documentElement.scrollTop || 0;
  }
  _navStack.push({...state, scrollPos: 0});
}

function _navReplace(state) {
  if (_navStack.length > 0) {
    _navStack[_navStack.length - 1] = {
      ..._navStack[_navStack.length - 1],
      ...state
    };
  } else {
    _navStack.push({...state, scrollPos: 0});
  }
}

function _navBack() {
  if (_navStack.length <= 1) return null;
  _navStack.pop(); // شيل الصفحة الحالية
  return _navStack[_navStack.length - 1]; // ارجع للسابقة
}


function navTab(tab){
  _activeTab=tab;
  sFav=false;
  if(tab!=='discounts') sDiscount=false;
  // موبايل ناف
  document.querySelectorAll('.bnav-item').forEach(b=>b.classList.remove('act'));
  const mBtn=document.querySelector(`.bnav-item[data-p="${tab}"]`);
  if(mBtn)mBtn.classList.add('act');
  // لابتوب ناف
  document.querySelectorAll('.desk-nav-btn').forEach(b=>b.classList.remove('act'));
  const dBtn=document.querySelector(`.desk-nav-btn[data-p="${tab}"]`);
  if(dBtn)dBtn.classList.add('act');

  if(tab==='home'){sC=null;sType=null;sFeatured=false;nav('home');}
  else if(tab==='all-listings'){sC=null;sType=null;sFeatured=false;nav('listings');}
  else if(tab==='cars'){sC=null;sType='car';sFeatured=false;nav('listings');}
  else if(tab==='apts'){sC=null;sType='apartment';sFeatured=false;nav('listings');}
  else if(tab==='equips'){sC=null;sType='equipment';sFeatured=false;nav('listings');}
  else if(tab==='shops'){sC=null;sType='shop';sFeatured=false;nav('listings');}
  else if(tab==='farms'){sC=null;sType='farm';sFeatured=false;nav('listings');}
  else if(tab==='freeads'){sC=null;sType='freead';sFeatured=false;sFreeGroup=null;nav('listings');}
  else if(tab==='partners'){sC=null;sType='partner';sFeatured=false;nav('listings');}
  else if(tab==='discounts'){sC=null;sType=null;sFeatured=false;sDiscount=true;nav('listings');}
}
function nav(page,detailId,keepPage){
  clearTimers();
  if(page!=='detail'){
    const bar=document.getElementById('abBottomBar');if(bar)bar.remove();
    const ov=document.getElementById('bookConfirmOverlay');if(ov)ov.remove();
  }
  // وحّد حالة "نشط" في شريطي التنقّل (العلوي والسفلي) — زرّ واحد فقط نشط
  const _navP = page==='home' ? 'home' : (page==='listings' ? (sDiscount?'discounts':(sFav?'favorites':typeToTab(sType))) : null);
  document.querySelectorAll('.desk-nav-btn').forEach(b=>b.classList.remove('act'));
  document.querySelectorAll('.bnav-item').forEach(b=>b.classList.remove('act'));
  if(_navP){
    const db=document.querySelector(`.desk-nav-btn[data-p="${_navP}"]`); if(db)db.classList.add('act');
    const mb=document.querySelector(`.bnav-item[data-p="${_navP}"]`); if(mb)mb.classList.add('act');
  }
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('act'));
  document.getElementById('page-'+page).classList.add('act');
  updateBackToMenu();
  if(page==='home') renderHome();
  if(page==='listings') renderListings(keepPage);
  if(!_skipPush) window.scrollTo({top:0,behavior:'smooth'});
  if(!_skipPush){
    const state={page,sC,sType,sFeatured,sQ,sDiscount,detailId:detailId||null,currentPage:_currentPage};
    history.pushState(state,'',null);
    try{ sessionStorage.setItem('tam_state', JSON.stringify(state)); }catch(e){}  // حفظ فوري لمكانك الحالي
  }
  _skipPush=false;
}

// (أُزيل الزر الطائف "رجوع للقائمة" — استُبدل بسهم رجوع صغير بجانب خانة البحث)
function updateBackToMenu(){}
// أكورديون صفحة الشروط وسياسة الخصوصية
function toggleTermsAcc(btn){ var acc=btn.closest('.terms-acc'); if(acc) acc.classList.toggle('open'); }
window.toggleTermsAcc=toggleTermsAcc;

// زر الرجوع بالمتصفح — يتزامن مع _navStack
window.addEventListener('popstate',function(e){
  _skipPush=true;
  const bar=document.getElementById('abBottomBar');if(bar)bar.remove();
  const ov=document.getElementById('bookConfirmOverlay');if(ov)ov.remove();
  if(e.state){
    sC=e.state.sC;sType=e.state.sType;sFeatured=e.state.sFeatured;sQ=e.state.sQ||'';
    if(e.state.currentPage!==undefined) _currentPage=e.state.currentPage;

    if(e.state.page==='detail'&&e.state.detailId){
      viewDetail(e.state.detailId);
    }else if(e.state.page==='listings'){
      _activeTab=typeToTab(sType);
      document.querySelectorAll('.bnav-item').forEach(b=>b.classList.remove('act'));
      const mBtn=document.querySelector(`.bnav-item[data-p="${_activeTab}"]`);
      if(mBtn)mBtn.classList.add('act');
      document.querySelectorAll('.desk-nav-btn').forEach(b=>b.classList.remove('act'));
      const dBtn=document.querySelector(`.desk-nav-btn[data-p="${_activeTab}"]`);
      if(dBtn)dBtn.classList.add('act');
      document.querySelectorAll('.page').forEach(p=>p.classList.remove('act'));
      document.getElementById('page-listings').classList.add('act');
      updateBackToMenu();
      renderListings(true);
      if(e.state.scrollPos) setTimeout(()=>window.scrollTo(0,e.state.scrollPos),100);
    }else{
      _activeTab='home';
      document.querySelectorAll('.bnav-item').forEach(b=>b.classList.remove('act'));
      const mBtn=document.querySelector('.bnav-item[data-p="home"]');
      if(mBtn)mBtn.classList.add('act');
      nav('home');
      if(e.state.scrollPos) setTimeout(()=>window.scrollTo(0,e.state.scrollPos),100);
    }
  }
  _skipPush=false;
});

/* ===== HOME ===== */
function renderHome(){
  initHero();
  
  // Categories (merged: شقق + سيارات + معدات + إعلانات مجانية)
  // صور التصنيفات الدائرية — كلها PNG بأسماء موحّدة وبنفس الحجم تماماً (يُفضّل 512×512)
  const mergedCats=[
    {type:'apartment',label:'شقق',img:'cat-apt.png'},
    {type:'car',label:'سيارات',img:'cat-car.png'},
    {type:'equipment',label:'معدات',img:'cat-equip.png'},
    {type:'shop',label:'محلات تجارية',img:'cat-shop.png'},
    {type:'farm',label:'أراضي',img:'cat-farm.png'},
    {type:'freead',label:'مهن وخدمات',img:'cat-free.png'},
    {type:'partner',label:'ابحث عن شريك',img:'cat-partner.png'}
  ];
  let catHTML='';
  mergedCats.forEach(c=>{
    const tab=typeToTab(c.type);
    catHTML+=`<div class="cat-item" onclick="sC=null;sType='${c.type}';navTab('${tab}')">
      <div class="cat-circle"><img src="${c.img}" alt="${c.label}" loading="lazy"></div>
      <div class="cat-label">${c.label}</div>
    </div>`;
  });
  // مجموعة واحدة فقط — بلا تكرار: تنساب تلقائياً حتى آخر تصنيف ثم تتوقّف (يدوي بعدها)
  document.getElementById('catGrid').innerHTML='<div class="cat-track"><div class="cat-set">'+catHTML+'</div></div>';
  initCatScroll();
  
  // Featured - المميزة (بدون إعلانات مجانية أبداً)
  const featItems=listings.filter(l=>l.featured && !isFreeAd(l.catId) && !isPartner(l.catId));
  document.getElementById('featScroll').innerHTML=featItems.map((l,i)=>renderCard(l,i)).join('');

  // التخفيضات - كل ما عليه خصم (شريط بين المميزة والأحدث)
  const discItems=listings.filter(l=>!isFreeAd(l.catId) && !isPartner(l.catId) && discountPct(l)>0);
  const discSec=document.getElementById('discountSection');
  if(discItems.length){
    if(discSec) discSec.style.display='';
    document.getElementById('discountScroll').innerHTML=discItems.map((l,i)=>renderCard(l,i)).join('');
  } else if(discSec){ discSec.style.display='none'; }

  // Latest - 16 كروت مع خلط دوري
  const latestNonFree=listings.filter(l=>!isFreeAd(l.catId) && !isPartner(l.catId)).slice(0,13);
  const latestFree=listings.filter(l=>isFreeAd(l.catId)).slice(0,3);
  const latestMixed=mixFreeAds(latestNonFree,latestFree,4);
  document.getElementById('latestGrid').innerHTML=latestMixed.map((l,i)=>renderCard(l,i)).join('');

  // شريط العروض المتحرك (مزادات + تخفيضات)
  renderNewsTicker(discItems);

  setTimeout(()=>initCarousels(document.getElementById('page-home')),150);
  // تحريك تلقائي للمميزة على الموبايل فقط
  if(window.innerWidth<1024) setTimeout(()=>initFeaturedAutoScroll(),300);
}

/* ===== FEATURED AUTO-SCROLL (موبايل فقط) ===== */
let featScrollTimer=null;
function fastScrollTo(el,target,duration){
  const start=el.scrollLeft;
  const diff=target-start;
  let startTime=null;
  function step(t){
    if(!startTime)startTime=t;
    const p=Math.min((t-startTime)/duration,1);
    const ease=p<0.5?2*p*p:(1-Math.pow(-2*p+2,2)/2);
    el.scrollLeft=start+diff*ease;
    if(p<1)requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
function initFeaturedAutoScroll(){
  clearInterval(featScrollTimer);
  const el=document.getElementById('featScroll');
  if(!el||!el.children.length)return;
  let idx=0;
  const total=el.children.length;
  featScrollTimer=setInterval(()=>{
    idx++;
    if(idx>=total){idx=0;fastScrollTo(el,0,300);}
    else{const card=el.children[idx];if(card)fastScrollTo(el,card.offsetLeft-el.offsetLeft,300);}
  },3000);
  el.addEventListener('touchstart',()=>clearInterval(featScrollTimer),{passive:true});
  el.addEventListener('touchend',()=>{
    clearInterval(featScrollTimer);
    setTimeout(()=>initFeaturedAutoScroll(),4000);
  },{passive:true});
}
/* ===== ALL CATEGORIES OVERLAY ===== */
function openAllCategories(){
  const allCats=[
    {label:'شقق للإيجار',tab:'apts',type:'apartment',catId:'apt-rent',icon:'🏠',bg:'rgba(13,148,136,.1)',color:'#0D9488'},
    {label:'شقق للبيع',tab:'apts',type:'apartment',catId:'apt-sale',icon:'🏢',bg:'rgba(0,0,0,.1)',color:'#000'},
    {label:'سيارات للإيجار',tab:'cars',type:'car',catId:'car-rent',icon:'🚗',bg:'rgba(124,58,237,.1)',color:'#7C3AED'},
    {label:'سيارات للبيع',tab:'cars',type:'car',catId:'car-sale',icon:'🚘',bg:'rgba(225,29,72,.1)',color:'#E11D48'},
    {label:'معدات للإيجار',tab:'equips',type:'equipment',catId:'equip-rent',icon:'🔧',bg:'rgba(217,119,6,.1)',color:'#D97706'},
    {label:'معدات للبيع',tab:'equips',type:'equipment',catId:'equip-sale',icon:'⚙️',bg:'rgba(180,83,9,.1)',color:'#B45309'},
    {label:'محلات تجارية للإيجار',tab:'shops',type:'shop',catId:'shop-rent',icon:'🏪',bg:'rgba(37,99,235,.1)',color:'#2563EB'},
    {label:'محلات تجارية للبيع',tab:'shops',type:'shop',catId:'shop-sale',icon:'🏬',bg:'rgba(29,78,216,.1)',color:'#1D4ED8'},
    {label:'أراضي للإيجار',tab:'farms',type:'farm',catId:'farm-rent',icon:'🌾',bg:'rgba(22,163,74,.1)',color:'#16A34A'},
    {label:'أراضي للبيع',tab:'farms',type:'farm',catId:'farm-sale',icon:'🚜',bg:'rgba(21,128,61,.1)',color:'#15803D'},
    {label:'مهن وخدمات',tab:'freeads',type:'freead',catId:'free-ad',icon:'📢',bg:'rgba(5,150,105,.1)',color:'#059669'},
    {label:'ابحث عن شريك',tab:'partners',type:'partner',catId:'find-partner',icon:'🤝',bg:'rgba(246,146,30,.1)',color:'#F6921E'},
  ];
  let html='';
  allCats.forEach(c=>{
    const count=listings.filter(l=>l.catId===c.catId).length;
    html+=`<div class="allcats-card" onclick="closeAllCategories();sC='${c.catId}';sType='${c.type}';navTab('${c.tab}')">
      <div class="allcats-card-icon" style="background:${c.bg};color:${c.color}"><span style="font-size:28px">${c.icon}</span></div>
      <div class="allcats-card-label">${c.label}</div>
      <div class="allcats-card-count">${count} إعلان</div>
    </div>`;
  });
  document.getElementById('allCatsGrid').innerHTML=html;
  document.getElementById('allCatsOverlay').classList.add('show');
  document.body.style.overflow='hidden';
}
function closeAllCategories(){
  document.getElementById('allCatsOverlay').classList.remove('show');
  document.body.style.overflow='';
}

/* ===== ADVANCED FILTER SHEET ===== */
let _filters={};

function openFilterSheet(){
  buildFilterOptions();
  document.getElementById('filterOverlay').classList.add('open');
  document.getElementById('filterSheet').classList.add('open');
}
function closeFilterSheet(){
  document.getElementById('filterOverlay').classList.remove('open');
  document.getElementById('filterSheet').classList.remove('open');
}

function buildFilterOptions(){
  const type=sType;
  const typeLabels={apartment:'شقق',car:'سيارات',equipment:'معدات',freead:'مهن وخدمات',partner:'ابحث عن شريك'};
  document.getElementById('fsTitle').textContent='فلتر'+(type?' — '+typeLabels[type]:'');
  
  // Get relevant listings for extracting unique values
  const pool=type?listings.filter(l=>getCat(l.catId).type===type):listings;
  
  let html='';
  
  // Location - always show
  const locs=[...new Set(pool.map(l=>l.location))];
  html+=buildChipSection('الموقع / الحي','loc',locs);
  
  if(type==='car'){
    const types=[...new Set(pool.map(l=>l.carType).filter(Boolean))];
    const models=[...new Set(pool.map(l=>l.carModel).filter(Boolean))];
    const classes=[...new Set(pool.map(l=>l.carClass).filter(Boolean))];
    const colors=[...new Set(pool.map(l=>l.carColor).filter(Boolean))];
    const years=[...new Set(pool.map(l=>l.carYear).filter(Boolean))].sort((a,b)=>b-a);
    html+=buildChipSection('نوع السيارة','carType',types);
    html+=buildChipSection('الموديل','carModel',models);
    html+=buildChipSection('الفئة','carClass',classes);
    html+=buildChipSection('اللون','carColor',colors);
    html+=buildChipSection('سنة الصنع','carYear',years.map(y=>y+'+'));
    html+=`<div class="fs-section"><div class="fs-label">الكيلومتراج (كم) — حد أقصى</div><input type="number" class="fs-input" id="fsKm" placeholder="حد أقصى (كم)" value="${_filters.maxKm||''}"></div>`;
  }else if(type==='apartment'){
    const rooms=[...new Set(pool.map(l=>l.rooms).filter(Boolean))].sort((a,b)=>a-b);
    const baths=[...new Set(pool.map(l=>l.baths).filter(Boolean))].sort((a,b)=>a-b);
    html+=buildChipSection('غرف النوم','rooms',rooms);
    html+=buildChipSection('الحمامات','baths',baths);
    html+=`<div class="fs-section"><div class="fs-label">المساحة (م²) — حد أدنى</div><input type="number" class="fs-input" id="fsArea" placeholder="حد أدنى (م²)" value="${_filters.minArea||''}"></div>`;
  }else if(type==='freead'){
    const profs=[...new Set(pool.map(l=>l.profession).filter(Boolean))];
    html+=buildChipSection('المهنة','profession',profs);
  }
  
  // Price range - always
  html+=`<div class="fs-section"><div class="fs-label">السعر — حد أقصى</div><input type="number" class="fs-input" id="fsPrice" placeholder="حد أقصى (ل.س.ج)" value="${_filters.maxPrice||''}"></div>`;
  
  document.getElementById('fsBody').innerHTML=html;
  
  // Restore previous selections
  Object.keys(_filters).forEach(k=>{
    if(Array.isArray(_filters[k])){
      _filters[k].forEach(v=>{
        const chip=document.querySelector(`.fs-chip[data-key="${k}"][data-val="${v}"]`);
        if(chip)chip.classList.add('act');
      });
    }
  });
}

function buildChipSection(label,key,values){
  if(!values.length)return '';
  let html=`<div class="fs-section"><div class="fs-label">${label}</div><div class="fs-chips">`;
  html+=`<button class="fs-chip${!_filters[key]||!_filters[key].length?' act':''}" data-key="${key}" data-val="" onclick="toggleFilterChip(this,'${key}','')">الكل</button>`;
  values.forEach(v=>{
    const sel=_filters[key]&&_filters[key].includes(String(v));
    html+=`<button class="fs-chip${sel?' act':''}" data-key="${key}" data-val="${v}" onclick="toggleFilterChip(this,'${key}','${v}')">${v}</button>`;
  });
  html+=`</div></div>`;
  return html;
}

function toggleFilterChip(el,key,val){
  if(!val){
    // "الكل" clicked - clear this filter
    delete _filters[key];
    el.parentElement.querySelectorAll('.fs-chip').forEach(c=>c.classList.remove('act'));
    el.classList.add('act');
    return;
  }
  // Remove "الكل" active
  const allBtn=el.parentElement.querySelector('.fs-chip[data-val=""]');
  if(allBtn)allBtn.classList.remove('act');
  
  if(!_filters[key])_filters[key]=[];
  const idx=_filters[key].indexOf(val);
  if(idx>-1){
    _filters[key].splice(idx,1);
    el.classList.remove('act');
    if(!_filters[key].length){delete _filters[key];if(allBtn)allBtn.classList.add('act');}
  }else{
    _filters[key].push(val);
    el.classList.add('act');
  }
}

function clearAllFilters(){
  _filters={};
  buildFilterOptions();
}

function applyFilters(){
  // Save input values
  const kmEl=document.getElementById('fsKm');
  const areaEl=document.getElementById('fsArea');
  const priceEl=document.getElementById('fsPrice');
  if(kmEl&&kmEl.value)_filters.maxKm=parseInt(kmEl.value);else delete _filters.maxKm;
  if(areaEl&&areaEl.value)_filters.minArea=parseInt(areaEl.value);else delete _filters.minArea;
  if(priceEl&&priceEl.value)_filters.maxPrice=parseInt(priceEl.value);else delete _filters.maxPrice;
  closeFilterSheet();
  filterListings();
}

function renderListings(keepPage){
  _filters={};
  const typeLabels={apartment:'شقق',car:'سيارات',equipment:'معدات',freead:'مهن وخدمات',partner:'ابحث عن شريك'};
  document.getElementById('listTitle').textContent=sFav?'المفضلة':sDiscount?'تخفيضات':sFeatured?'إعلانات مميزة':sC?getCat(sC).label:sType?typeLabels[sType]:'جميع الإعلانات';
  if(sQ)document.getElementById('listSearch').value=sQ;
  
  const visibleCats=sType?CATS.filter(c=>c.type===sType):CATS;
  let fb;
  if(sType==='freead'){
    // قسم مهن وخدمات: تبويبات المجموعات بجانب «الكل»
    fb=`<button class="f-btn ${!sFreeGroup?'act':''}" onclick="setFreeGroup(null)">الكل</button>`
      +`<button class="f-btn ${sFreeGroup==='handy'?'act':''}" onclick="setFreeGroup('handy')">خدمات مهنية</button>`
      +`<button class="f-btn ${sFreeGroup==='home'?'act':''}" onclick="setFreeGroup('home')">أسر منتجة</button>`;
  }else{
    fb=`<button class="f-btn ${!sC?'act':''}" onclick="sC=null;filterListings()">الكل</button>`;
    visibleCats.forEach(c=>{
      fb+=`<button class="f-btn ${sC===c.id?'act':''}" onclick="sC='${c.id}';filterListings()">${c.label}</button>`;
    });
  }
  document.getElementById('filterRow').innerHTML=fb;
  // في المفضلة: بلا بحث ولا فلترة ولا أقسام — فقط الإعلانات المفضّلة
  var _sr=document.querySelector('.list-search-row');
  if(_sr) _sr.style.display = sFav ? 'none' : '';
  document.getElementById('filterRow').style.display = sFav ? 'none' : '';
  filterListings(keepPage);
}

let _currentPage=1;
const PER_PAGE=50;
let _filteredList=[];
let _loadedCount=0;
let _scrollLoading=false;
function filterListings(keepPage){
  clearTimers();
  if(!keepPage) _currentPage=1;
  const q=document.getElementById('listSearch').value.trim();
  const filtered=listings.filter(l=>{
    const mc=!sC||l.catId===sC;
    const mt=!sType||getCat(l.catId).type===sType;
    const mf=!sFeatured||l.featured;
    const mfav=!sFav||isFav(l.id);
    const mdisc=!sDiscount||discountPct(l)>0;
    const ms=!q||l.title.includes(q)||l.desc.includes(q)||l.location.includes(q)||(l.carType||'').includes(q)||(l.carModel||'').includes(q)||(l.profession||'').includes(q);
    if(!(mc&&mt&&mf&&mfav&&mdisc&&ms))return false;
    
    // Advanced filters
    if(_filters.loc&&_filters.loc.length&&!_filters.loc.includes(l.location))return false;
    if(_filters.carType&&_filters.carType.length&&!_filters.carType.includes(l.carType))return false;
    if(_filters.carModel&&_filters.carModel.length&&!_filters.carModel.includes(l.carModel))return false;
    if(_filters.carClass&&_filters.carClass.length&&!_filters.carClass.includes(l.carClass))return false;
    if(_filters.carColor&&_filters.carColor.length&&!_filters.carColor.includes(l.carColor))return false;
    if(_filters.carYear&&_filters.carYear.length){
      const yrs=_filters.carYear.map(y=>parseInt(y));
      if(!yrs.some(y=>l.carYear>=y))return false;
    }
    if(_filters.rooms&&_filters.rooms.length&&!_filters.rooms.includes(String(l.rooms)))return false;
    if(_filters.baths&&_filters.baths.length&&!_filters.baths.includes(String(l.baths)))return false;
    if(_filters.maxKm&&l.carKm&&l.carKm>_filters.maxKm)return false;
    if(_filters.minArea&&l.area&&l.area<_filters.minArea)return false;
    if(_filters.maxPrice&&l.price>_filters.maxPrice)return false;
    if(_filters.profession&&_filters.profession.length&&!_filters.profession.includes(l.profession))return false;
    // تبويب الإعلانات المجانية (أعمال يدوية / منزلية)
    if(sType==='freead' && sFreeGroup && freeGroup(l)!==sFreeGroup) return false;

    return true;
  });
  
  const _visCats=sType?CATS.filter(c=>c.type===sType):CATS;
  if(sType==='freead'){
    // قسم مهن وخدمات: النشط حسب المجموعة (الكل/خدمات مهنية/أسر منتجة)
    document.querySelectorAll('#filterRow .f-btn').forEach((b,i)=>{
      b.classList.toggle('act', (i===0 && !sFreeGroup) || (i===1 && sFreeGroup==='handy') || (i===2 && sFreeGroup==='home'));
    });
  } else {
    document.querySelectorAll('#filterRow .f-btn').forEach((b,i)=>{
      if(i===0)b.classList.toggle('act',!sC);
      else b.classList.toggle('act',sC===_visCats[i-1]?.id);
    });
  }
  
  const typeLabels={apartment:'شقق',car:'سيارات',equipment:'معدات',freead:'مهن وخدمات',partner:'ابحث عن شريك'};
  document.getElementById('listTitle').textContent=sFav?'المفضلة':sDiscount?'تخفيضات':sFeatured?'إعلانات مميزة':sC?getCat(sC).label:sType?typeLabels[sType]:'جميع الإعلانات';
  document.getElementById('listCount').textContent=filtered.length+' إعلان';
  
  // Show free-ad CTA when viewing free ads section
  const freeCtaEl=document.getElementById('freeAdCtaList');
  if(sType==='freead'){
    freeCtaEl.innerHTML=`<a class="free-ad-cta" style="margin:0 0 16px" onclick="openFreeAdModal()">
      <div class="free-ad-cta-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></div>
      <div class="free-ad-cta-text"><strong>اعرض مهنتك أو خدمتك</strong><span>تواصل معنا وننشرها بدون رسوم</span></div>
      <div class="free-ad-cta-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg></div>
    </a>`;
  }else if(sType==='partner'){
    freeCtaEl.innerHTML=`<a class="free-ad-cta" style="margin:0 0 16px;background:linear-gradient(135deg,#F6921E,#E07D0A)" onclick="openPartnerModal()">
      <div class="free-ad-cta-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></div>
      <div class="free-ad-cta-text"><strong>اطرح فرصتك أو ابحث عن شريك</strong><span>أرسل التفاصيل وننشرها لك مجاناً</span></div>
      <div class="free-ad-cta-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg></div>
    </a>`;
  }else{
    freeCtaEl.innerHTML='';
  }

  if(!filtered.length){
    document.getElementById('allGrid').innerHTML='';
    document.getElementById('paginationWrap').innerHTML='';
    document.getElementById('emptyState').style.display='block';
  }else{
    document.getElementById('emptyState').style.display='none';
    // خلط الإعلانات المجانية بشكل دوري لما يكون عرض الكل
    if(!sType && !sC && !sFeatured){
      const mainItems=filtered.filter(l=>!isFreeAd(l.catId) && !isPartner(l.catId));
      const freeItems=filtered.filter(l=>isFreeAd(l.catId));
      _filteredList=mixFreeAds(mainItems,freeItems,4);
    }else{
      _filteredList=filtered;
    }
    renderPage(_currentPage);
  }
}

function goToPage(page){
  const state={page:'listings',sC,sType,sFeatured,sQ,detailId:null,currentPage:page};
  history.pushState(state,'',null);
  renderPage(page);
}

function renderPage(page){
  clearTimers();
  _currentPage=page;
  const start = (page - 1) * PER_PAGE;
  const end = Math.min(start + PER_PAGE, _filteredList.length);
  const pageItems = _filteredList.slice(start, end);
  
  document.getElementById('allGrid').innerHTML = pageItems.map((l, i) => renderCard(l, i, 'full')).join('');
  setTimeout(() => initCarousels(document.getElementById('allGrid')), 150);
  
  // Pagination
  renderPagination(page, Math.ceil(_filteredList.length / PER_PAGE), _filteredList.length, start, end);

  // Scroll to top of listings when changing page
  const listEl = document.getElementById('page-listings');
  if(listEl) window.scrollTo({top: listEl.offsetTop - 64, behavior: 'smooth'});
}
function renderPagination(current,totalPages,total,start,end){
  const wrap=document.getElementById('paginationWrap');
  if(totalPages<=1){wrap.innerHTML='';return;}
  
  let html='<div class="pagination-container">';
  // Previous button
  html+=`<button class="pg-btn" ${current===1?'disabled':''} onclick="goToPage(${current-1})">${ICON.prev}</button>`;
  
  // Smart ellipsis: always show first, last, and 2 pages around current
  const pages=[];
  const sidePages = 1; // Number of pages to show on each side of current
  
  if(totalPages <= 7){
    for(let i=1; i<=totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    
    if(current > sidePages + 3){
      pages.push('...');
    }
    
    const lo = Math.max(2, current - sidePages);
    const hi = Math.min(totalPages - 1, current + sidePages);
    
    for(let i=lo; i<=hi; i++){
      if(!pages.includes(i)) pages.push(i);
    }
    
    if(current < totalPages - (sidePages + 2)){
      pages.push('...');
    }
    
    if(!pages.includes(totalPages)) pages.push(totalPages);
  }
  
  pages.forEach(p=>{
    if(p==='...'){
      html+=`<span class="pg-dots">...</span>`;
    }else{
      html+=`<button class="pg-btn${p===current?' act':''}" onclick="goToPage(${p})">${p}</button>`;
    }
  });
  
  // Next button
  html+=`<button class="pg-btn" ${current===totalPages?'disabled':''} onclick="goToPage(${current+1})">${ICON.next}</button>`;
  html+='</div>';
  
  // Info text
  html+=`<div class="pg-info">عرض ${start+1}–${end} من ${total} إعلان</div>`;
  
  wrap.innerHTML=html;
}

/* ===== DETAIL ===== */
function viewDetail(id){
  clearTimers();
  const l=listings.find(x=>String(x.id)===String(id));if(!l)return;
  window._currentListing=l;

  // Browser history for detail page
  if(!_skipPush){
    const scrollPos = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop;
    const currentState = history.state || {};
    currentState.scrollPos = scrollPos;
    currentState.currentPage = _currentPage;
    history.replaceState(currentState, '', null);

    const state={page:'detail',sC,sType,sFeatured,sQ,sDiscount,detailId:id,currentPage:_currentPage};
    history.pushState(state,'',null);
    try{ sessionStorage.setItem('tam_state', JSON.stringify(state)); }catch(e){}  // حفظ فوري للإعلان الحالي
  }

  // Remove any existing bottom bar
  const oldBar=document.getElementById('abBottomBar');
  if(oldBar)oldBar.remove();
  const oldOverlay=document.getElementById('bookConfirmOverlay');
  if(oldOverlay)oldOverlay.remove();

  // Switch to detail page
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('act'));
  document.getElementById('page-detail').classList.add('act');
  updateBackToMenu();
  setTimeout(prefillContactFields, 250);
  
  // Scroll to top
  window.scrollTo({top:0,behavior:'smooth'});

  const cat=getCat(l.catId),apt=isApt(l.catId),rent=isRent(l.catId);
  const equip=isEquip(l.catId);
  const freead=isFreeAd(l.catId)||isPartner(l.catId);
  const shop=isShop(l.catId),farm=isFarm(l.catId);
  // بلا صورة: لا تُوضع صورة وهمية — تُعرض صفحة الإعلان بدون معرض صور
  let imgs=l.images?.length?l.images:[];
  if(freead) imgs=imgs.slice(0,1);
  
  const imgHTML=imgs.map((s,j)=>`<img src="${s}" alt="${esc(l.title)}" class="${j===0?'act':''}" loading="lazy" onclick="openLightbox(${j})">`).join('');
  const dotsHTML=imgs.length>1?`<div class="l-dots">${imgs.map((_,j)=>`<span class="${j===0?'act':''}"></span>`).join('')}</div>`:'';
  let badgeClass=l.catId==='apt-rent'?'rent':l.catId==='apt-sale'?'sale':l.catId==='car-rent'?'car-r':l.catId==='car-sale'?'car-s':l.catId==='equip-rent'?'equip-r':l.catId==='free-ad'?'free-ad':l.catId==='shop-rent'?'shop-r':l.catId==='shop-sale'?'shop-s':l.catId==='farm-rent'?'farm-r':l.catId==='farm-sale'?'farm-s':'equip-s';

	  // قالب موحّد بأسلوب Gathern لكل الإعلانات (إيجار/بيع/مجاني)
	  if(window._auctionStop) window._auctionStop();
	  document.getElementById('detWrap').innerHTML = gathernDetailHTML(l, cat, imgs, badgeClass);
	  if(l.isAuction && !isRent(l.catId) && !isFreeAd(l.catId) && window._auctionInit){ window._auctionInit(l); }
	  return;
	  if(rent && apt){
	    // ===== RENTAL APARTMENTS - with Monthly/Daily toggle =====
	    let specsHTML=buildDetailSpecs(l,apt);
	    
	    document.getElementById('detWrap').innerHTML=`
	      <div class="det-gallery af">${imgHTML}${dotsHTML}
	        <button class="det-back" onclick="goBack(event)">${ICON.back}</button>
	        <button class="det-share-top" onclick="event.stopPropagation();shareListing('${l.id}')">${ICON.share}</button>
	      </div>
	      <div class="det-content">
	        <div class="det-title af">${esc(l.title)} <span class="det-id">${esc(l.ref||('#'+l.id))}</span></div>
		        <div class="det-meta af s1">
		          <div class="det-meta-item"><span class="det-meta-label">السعر</span><span class="det-meta-val det-meta-price" id="aptRentPrice">${fmtPrice(l.price,true)} <small style="font-size:11px;font-weight:600;color:var(--s400)">/ يوم</small></span>${usdHTML(l.price)}</div>
		          <div class="det-meta-item"><span class="det-meta-label">الموقع</span><span class="det-meta-val" onclick="openListingMap('${l.id}')" style="cursor:pointer;color:var(--primary)">${l.neighborhood ? esc(l.neighborhood) + ' / ' + esc(l.city) : esc(l.location)}</span></div>
		          <div class="det-meta-item"><span class="det-meta-label">القسم</span><span class="det-meta-val">${cat.label}</span></div>
		          <div class="det-meta-item"><span class="det-meta-label">التفاوض</span><span class="det-meta-val">${l.negotiable ? '<span class="det-meta-neg-yes">✓ قابل للتفاوض</span>' : '<span class="det-meta-neg-no">غير قابل للتفاوض</span>'}</span></div>
		        </div>
	        <div class="det-specs af s2">${specsHTML}</div>
	        ${buildMapSection(l)}
	        <div class="det-desc af s3">
	          <h3 class="det-desc-title">الوصف</h3>${esc(l.desc)}
	        </div>


	        <!-- Monthly/Daily Toggle -->
	        <div class="rent-type-toggle af s4">
	          <button class="rt-btn act" id="rtDaily" onclick="switchRentType('daily',${l.price})">إيجار يومي</button>
	          <button class="rt-btn" id="rtMonthly" onclick="switchRentType('monthly',${l.price})">إيجار شهري</button>
	        </div>

	        <!-- Daily Calendar Section -->
	        <div id="dailySection">
	          <div class="rent-cal-layout">
	            <div class="rent-cal-main">
	              <div id="calSection" class="af s4">
	                <div class="cal-box" id="calBox">
	                  <div class="cal-grid-wrap">
	                    <div class="cal-head-title">${ICON.cal} تواريخ الحجز</div>
	                    <div class="cal-nav">
	                      <button onclick="calPrev()">${ICON.prev}</button>
	                      <div class="cal-mn" id="calMonth"></div>
	                      <button onclick="calNext()">${ICON.next}</button>
	                    </div>
	                    <div class="cal-grid" id="calGrid"></div>
	                  </div>
	                  <div class="cal-sum-wrap">
	                    <div class="cal-sum" id="calSummary" style="display:none">
	                      <div class="cal-row"><span class="cl">من</span><span class="cv" id="calFrom"></span></div>
	                      <div class="cal-row"><span class="cl">إلى</span><span class="cv" id="calTo"></span></div>
	                      <div class="cal-row"><span class="cl">المدة</span><span class="cv"><span id="calDays"></span> يوم</span></div>
	                      <div class="cal-row"><span class="cl">الإجمالي</span><span class="cv" id="calTotal"></span></div>
	                      <div style="text-align:center;margin-top:10px"><button class="cal-clear" onclick="clearCal()">مسح التواريخ</button></div>
	                    </div>
	                  </div>
	                </div>

	                <div id="bookFormSection" class="book-section af" style="display:none">
	                  <div class="bf-form-fields">
	                    <div class="bf-group"><label class="bf-label">الاسم الأول</label><input type="text" id="bfName" class="bf-input" placeholder="مثلاً: أحمد"></div>
	                    <div class="bf-group"><label class="bf-label">الكنية</label><input type="text" id="bfLast" class="bf-input" placeholder="مثلاً: علي"></div>
	                    <div class="bf-group"><label class="bf-label">رقم الهاتف</label><input type="tel" id="bfPhone" class="bf-input" placeholder="09xxxxxxxx" inputmode="numeric" pattern="[0-9]*" oninput="this.value=this.value.replace(/[^0-9]/g,'')"></div>
	                    <div class="bf-group"><label class="bf-label">العنوان <span class="opt-tag">(اختياري)</span></label><input type="text" id="bfAddress" class="bf-input" placeholder="المدينة، الحي"></div>
	                  </div>
	                  <div class="bf-form-footer">
	                    <button class="book-wa-btn" onclick="submitBooking('${l.id}')">إرسال طلب الحجز</button>
                    <button class="book-wa-btn" onclick="openChat('${l.id}')" style="background:#fff;color:var(--primary);border:1.5px solid var(--primary);margin-top:10px">تواصل مع الإدارة</button>	                  </div>
	                </div>
	              </div>
	            </div>
	            <div class="rent-book-sidebar">
	              <div class="rent-book-card">
	                <div class="rbc-price" id="abSidePrice">${fmtPrice(l.price,true)} <small>/ يوم</small></div>
	                <div class="rbc-dates" id="abSideDates">حدد التواريخ من الروزنامة</div>
	                <button class="rbc-btn" onclick="handleBookClick()">احجز الآن</button>
                <button class="rbc-btn" onclick="openChat('${l.id}')" style="background:#fff;color:var(--primary);border:1.5px solid var(--primary);margin-top:10px">تواصل مع الإدارة</button>
	              </div>
	            </div>
	          </div>
	        </div>

	        <!-- Monthly Section -->
	        <div id="monthlySection" style="display:none">
	          <div class="monthly-box af s4">
	            <h3 class="monthly-title">${ICON.cal} مدة الإيجار الشهري</h3>
	            <select class="monthly-select" id="monthlySelect" onchange="selectMonth(this.value,${l.price})">
	              <option value="">— اختر مدة الإيجار —</option>
	            </select>
	            <div class="monthly-summary" id="monthlySummary" style="display:none">
	              <div class="cal-row"><span class="cl">المدة</span><span class="cv" id="monthlyDuration"></span></div>
	              <div class="cal-row"><span class="cl">الإجمالي</span><span class="cv" id="monthlyTotal"></span></div>
	            </div>
	            <div id="monthlyBookForm" class="book-section af" style="display:none;margin-top:16px">
	              <div class="bf-form-fields">
	                <div class="bf-group"><label class="bf-label">الاسم الأول</label><input type="text" id="mbfName" class="bf-input" placeholder="مثلاً: أحمد"></div>
	                <div class="bf-group"><label class="bf-label">الكنية</label><input type="text" id="mbfLast" class="bf-input" placeholder="مثلاً: علي"></div>
	                <div class="bf-group"><label class="bf-label">رقم الهاتف</label><input type="tel" id="mbfPhone" class="bf-input" placeholder="09xxxxxxxx" inputmode="numeric" pattern="[0-9]*" oninput="this.value=this.value.replace(/[^0-9]/g,'')"></div>
	              </div>
	              <div class="bf-form-footer">
	                <button class="book-wa-btn" onclick="submitMonthlyBooking('${l.id}')">إرسال طلب الحجز</button>
                <button class="book-wa-btn" onclick="openChat('${l.id}')" style="background:#fff;color:var(--primary);border:1.5px solid var(--primary);margin-top:10px">تواصل مع الإدارة</button>
	              </div>
	            </div>
	          </div>
	        </div>

	      </div>`;

	    // Add bottom bar (mobile)
	    const bar=document.createElement('div');
	    bar.id='abBottomBar';
	    bar.className='rent-mobile-bar';
	    bar.innerHTML=`
	      <div style="display:flex;flex-direction:column">
	        <div style="font-size:20px;font-weight:900;color:#F6921E" id="abBarPrice">${fmtPrice(l.price,true)} <small style="font-size:12px;font-weight:500;color:#737373">/ يوم</small></div>
	        <div id="abBarDates" onclick="scrollToCal()" style="font-size:12px;color:#F6921E;font-weight:600;text-decoration:underline;cursor:pointer;margin-top:4px">حدد التواريخ</div>
	      </div>
	      <button onclick="handleBookClick()" style="background:linear-gradient(135deg,#000,#1a1a1a);color:#fff;border:none;border-radius:14px;padding:14px 28px;font-size:15px;font-weight:800;cursor:pointer;font-family:inherit;box-shadow:0 6px 20px rgba(0,0,0,.3)">احجز الآن</button>`;
	    document.body.appendChild(bar);
	    
	    // nav('detail'); // Removed to prevent double history push
	    setTimeout(()=>{
	      initCarousels(document.getElementById('detWrap'));
	      initCalendar(l.price);
	      initMonthlyGrid(l.price);
	    },150);
	    
	  }else if(rent && !equip){
    // ===== RENTAL (Cars with Calendar & Booking) =====
    let specsHTML=buildDetailSpecs(l,apt);
    
    document.getElementById('detWrap').innerHTML=`
      <div class="det-gallery af">${imgHTML}${dotsHTML}
        <button class="det-back" onclick="goBack(event)">${ICON.back}</button>
        <button class="det-share-top" onclick="event.stopPropagation();shareListing('${l.id}')">${ICON.share}</button>
      </div>
	      <div class="det-content">
	        <div class="det-title af">${esc(l.title)} <span class="det-id">${esc(l.ref||('#'+l.id))}</span></div>
	        <div class="det-meta af s1">
	          <div class="det-meta-item"><span class="det-meta-label">السعر</span><span class="det-meta-val det-meta-price">${fmtPrice(l.price,true)}</span>${usdHTML(l.price)}</div>
	          <div class="det-meta-item"><span class="det-meta-label">الموقع</span><span class="det-meta-val" onclick="openListingMap('${l.id}')" style="cursor:pointer;color:var(--primary)">${l.neighborhood ? esc(l.neighborhood) + ' / ' + esc(l.city) : esc(l.location)}</span></div>
	          <div class="det-meta-item"><span class="det-meta-label">القسم</span><span class="det-meta-val">${cat.label}</span></div>
	          <div class="det-meta-item"><span class="det-meta-label">التفاوض</span><span class="det-meta-val">${l.negotiable ? '<span class="det-meta-neg-yes">✓ قابل للتفاوض</span>' : '<span class="det-meta-neg-no">غير قابل للتفاوض</span>'}</span></div>
	        </div>
        <div class="det-specs af s2">${specsHTML}</div>
        ${buildMapSection(l, 'موقع السيارة')}
        <div class="det-desc af s3">
          <h3 class="det-desc-title">الوصف</h3>${esc(l.desc)}
        </div>


        <div class="rent-cal-layout">
          <div class="rent-cal-main">
            <div id="calSection" class="af s4">
              <div class="cal-box" id="calBox">
                <div class="cal-grid-wrap">
                  <div class="cal-head-title">${ICON.cal} تواريخ الحجز</div>
                  <div class="cal-nav">
                    <button onclick="calPrev()">${ICON.prev}</button>
                    <div class="cal-mn" id="calMonth"></div>
                    <button onclick="calNext()">${ICON.next}</button>
                  </div>
                  <div class="cal-grid" id="calGrid"></div>
                </div>
                <div class="cal-sum-wrap">
                  <div class="cal-sum" id="calSummary" style="display:none">
                    <div class="cal-row"><span class="cl">من</span><span class="cv" id="calFrom"></span></div>
                    <div class="cal-row"><span class="cl">إلى</span><span class="cv" id="calTo"></span></div>
                    <div class="cal-row"><span class="cl">المدة</span><span class="cv"><span id="calDays"></span> يوم</span></div>
                    <div class="cal-row"><span class="cl">الإجمالي</span><span class="cv" id="calTotal"></span></div>
                    <div style="text-align:center;margin-top:10px"><button class="cal-clear" onclick="clearCal()">مسح التواريخ</button></div>
                  </div>
                </div>
              </div>

              <div id="bookFormSection" class="book-section af" style="display:none">
                <div class="bf-form-fields">
                  <div class="bf-group"><label class="bf-label">الاسم الأول</label><input type="text" id="bfName" class="bf-input" placeholder="مثلاً: أحمد"></div>
                  <div class="bf-group"><label class="bf-label">الكنية</label><input type="text" id="bfLast" class="bf-input" placeholder="مثلاً: علي"></div>
                  <div class="bf-group"><label class="bf-label">رقم الهاتف</label><input type="tel" id="bfPhone" class="bf-input" placeholder="09xxxxxxxx" inputmode="numeric" pattern="[0-9]*" oninput="this.value=this.value.replace(/[^0-9]/g,'')"></div>
                  <div class="bf-group"><label class="bf-label">العنوان <span class="opt-tag">(اختياري)</span></label><input type="text" id="bfAddress" class="bf-input" placeholder="المدينة، الحي"></div>
                </div>
                <div class="bf-form-footer">
                  <button class="book-wa-btn" onclick="submitBooking('${l.id}')">إرسال طلب الحجز</button>
                    <button class="book-wa-btn" onclick="openChat('${l.id}')" style="background:#fff;color:var(--primary);border:1.5px solid var(--primary);margin-top:10px">تواصل مع الإدارة</button>                </div>
              </div>
            </div>
          </div>

          <div class="rent-book-sidebar">
            <div class="rent-book-card">
              <div class="rbc-price" id="abSidePrice">${fmtPrice(l.price,true)} <small>/ يوم</small></div>
              <div class="rbc-dates" id="abSideDates">حدد التواريخ من الروزنامة</div>
              <button class="rbc-btn" onclick="handleBookClick()">احجز الآن</button>
                <button class="rbc-btn" onclick="openChat('${l.id}')" style="background:#fff;color:var(--primary);border:1.5px solid var(--primary);margin-top:10px">تواصل مع الإدارة</button>
            </div>
          </div>
        </div>
      </div>`;

    // Add bottom bar for car rental (mobile only)
    const bar=document.createElement('div');
    bar.id='abBottomBar';
    bar.className='rent-mobile-bar';
    bar.innerHTML=`
      <div style="display:flex;flex-direction:column">
        <div style="font-size:20px;font-weight:900;color:#F6921E" id="abBarPrice">${fmtPrice(l.price,true)} <small style="font-size:12px;font-weight:500;color:#737373">/ يوم</small></div>
        <div id="abBarDates" onclick="scrollToCal()" style="font-size:12px;color:#F6921E;font-weight:600;text-decoration:underline;cursor:pointer;margin-top:4px">حدد التواريخ</div>
      </div>
      <button onclick="handleBookClick()" style="background:linear-gradient(135deg,#000,#1a1a1a);color:#fff;border:none;border-radius:14px;padding:14px 28px;font-size:15px;font-weight:800;cursor:pointer;font-family:inherit;box-shadow:0 6px 20px rgba(0,0,0,.3)">احجز الآن</button>`;
    document.body.appendChild(bar);
    
    // nav('detail'); // Removed to prevent double history push
    setTimeout(()=>{
      initCarousels(document.getElementById('detWrap'));
      initCalendar(l.price);
    },150);
    
  }else if(equip && isRent(l.catId)){
    // ===== EQUIPMENT RENTAL (with Calendar & Booking) =====
    document.getElementById('detWrap').innerHTML=`
      <div class="det-gallery af">${imgHTML}${dotsHTML}
        <button class="det-back" onclick="goBack(event)">${ICON.back}</button>
        <button class="det-share-top" onclick="event.stopPropagation();shareListing('${l.id}')">${ICON.share}</button>
      </div>
	      <div class="det-content">
	        <div class="det-title af">${esc(l.title)} <span class="det-id">${esc(l.ref||('#'+l.id))}</span></div>
	        <div class="det-meta af s1">
	          <div class="det-meta-item"><span class="det-meta-label">السعر</span><span class="det-meta-val det-meta-price">${fmtPrice(l.price,true)} <small style="font-size:11px;font-weight:600;color:var(--s400)">/ يوم</small></span>${usdHTML(l.price)}</div>
	          <div class="det-meta-item"><span class="det-meta-label">الموقع</span><span class="det-meta-val" onclick="openListingMap('${l.id}')" style="cursor:pointer;color:var(--primary)">${l.neighborhood ? esc(l.neighborhood) + ' / ' + esc(l.city) : esc(l.location)}</span></div>
	          <div class="det-meta-item"><span class="det-meta-label">القسم</span><span class="det-meta-val">${cat.label}</span></div>
	          <div class="det-meta-item"><span class="det-meta-label">التفاوض</span><span class="det-meta-val">${l.negotiable ? '<span class="det-meta-neg-yes">✓ قابل للتفاوض</span>' : '<span class="det-meta-neg-no">غير قابل للتفاوض</span>'}</span></div>
	        </div>
	        <div class="det-desc af s2">
	          <h3 class="det-desc-title">الوصف</h3>${esc(l.desc)}
	        </div>

	        <div class="rent-cal-layout">
	          <div class="rent-cal-main">
	            <div id="calSection" class="af s3">
	              <div class="cal-box" id="calBox">
	                <div class="cal-grid-wrap">
	                  <div class="cal-head-title">${ICON.cal} تواريخ الحجز</div>
	                  <div class="cal-nav">
	                    <button onclick="calPrev()">${ICON.prev}</button>
	                    <div class="cal-mn" id="calMonth"></div>
	                    <button onclick="calNext()">${ICON.next}</button>
	                  </div>
	                  <div class="cal-grid" id="calGrid"></div>
	                </div>
	                <div class="cal-sum-wrap">
	                  <div class="cal-sum" id="calSummary" style="display:none">
	                    <div class="cal-row"><span class="cl">من</span><span class="cv" id="calFrom"></span></div>
	                    <div class="cal-row"><span class="cl">إلى</span><span class="cv" id="calTo"></span></div>
	                    <div class="cal-row"><span class="cl">المدة</span><span class="cv"><span id="calDays"></span> يوم</span></div>
	                    <div class="cal-row"><span class="cl">الإجمالي</span><span class="cv" id="calTotal"></span></div>
	                    <div style="text-align:center;margin-top:10px"><button class="cal-clear" onclick="clearCal()">مسح التواريخ</button></div>
	                  </div>
	                </div>
	              </div>

	              <div id="bookFormSection" class="book-section af" style="display:none">
	                <div class="bf-form-fields">
	                  <div class="bf-group"><label class="bf-label">الاسم الأول</label><input type="text" id="bfName" class="bf-input" placeholder="مثلاً: أحمد"></div>
	                  <div class="bf-group"><label class="bf-label">الكنية</label><input type="text" id="bfLast" class="bf-input" placeholder="مثلاً: علي"></div>
	                  <div class="bf-group"><label class="bf-label">رقم الهاتف</label><input type="tel" id="bfPhone" class="bf-input" placeholder="09xxxxxxxx" inputmode="numeric" pattern="[0-9]*" oninput="this.value=this.value.replace(/[^0-9]/g,'')"></div>
	                  <div class="bf-group"><label class="bf-label">العنوان <span class="opt-tag">(اختياري)</span></label><input type="text" id="bfAddress" class="bf-input" placeholder="المدينة، الحي"></div>
	                </div>
	                <div class="bf-form-footer">
	                  <button class="book-wa-btn" onclick="submitBooking('${l.id}')">إرسال طلب الحجز</button>
                    <button class="book-wa-btn" onclick="openChat('${l.id}')" style="background:#fff;color:var(--primary);border:1.5px solid var(--primary);margin-top:10px">تواصل مع الإدارة</button>	                </div>
	              </div>
	            </div>
	          </div>

	          <div class="rent-book-sidebar">
	            <div class="rent-book-card">
	              <div class="rbc-price" id="abSidePrice">${fmtPrice(l.price,true)} <small>/ يوم</small></div>
	              <div class="rbc-dates" id="abSideDates">حدد التواريخ من الروزنامة</div>
	              <button class="rbc-btn" onclick="handleBookClick()">احجز الآن</button>
                <button class="rbc-btn" onclick="openChat('${l.id}')" style="background:#fff;color:var(--primary);border:1.5px solid var(--primary);margin-top:10px">تواصل مع الإدارة</button>
	            </div>
	          </div>
	        </div>
	      </div>`;

    // Add bottom bar (mobile)
    const bar=document.createElement('div');
    bar.id='abBottomBar';
    bar.className='rent-mobile-bar';
    bar.innerHTML=`
      <div style="display:flex;flex-direction:column">
        <div style="font-size:20px;font-weight:900;color:#F6921E" id="abBarPrice">${fmtPrice(l.price,true)} <small style="font-size:12px;font-weight:500;color:#737373">/ يوم</small></div>
        <div id="abBarDates" onclick="scrollToCal()" style="font-size:12px;color:#F6921E;font-weight:600;text-decoration:underline;cursor:pointer;margin-top:4px">حدد التواريخ</div>
      </div>
      <button onclick="handleBookClick()" style="background:linear-gradient(135deg,#000,#1a1a1a);color:#fff;border:none;border-radius:14px;padding:14px 28px;font-size:15px;font-weight:800;cursor:pointer;font-family:inherit;box-shadow:0 6px 20px rgba(0,0,0,.3)">احجز الآن</button>`;
    document.body.appendChild(bar);
    
    setTimeout(()=>{
      initCarousels(document.getElementById('detWrap'));
      initCalendar(l.price);
    },150);

  }else if(freead){
    // ===== FREE ADS - description only, no booking =====
    document.getElementById('detWrap').innerHTML=`
      <div class="det-gallery af">${imgHTML}${dotsHTML}
        <button class="det-back" onclick="goBack(event)">${ICON.back}</button>
        <button class="det-share-top" onclick="event.stopPropagation();shareListing('${l.id}')">${ICON.share}</button>
      </div>
	      <div class="det-content">
	        <div class="det-title af">${esc(l.title)} <span class="det-id">${esc(l.ref||('#'+l.id))}</span></div>
	        <div class="det-meta af s1">
	          <div class="det-meta-item"><span class="det-meta-label">النوع</span><span class="det-meta-val">مهن وخدمات</span></div>
	          <div class="det-meta-item"><span class="det-meta-label">الموقع</span><span class="det-meta-val" onclick="openListingMap('${l.id}')" style="cursor:pointer;color:var(--primary)">${l.neighborhood ? esc(l.neighborhood) + ' / ' + esc(l.city) : esc(l.location)}</span></div>
	          <div class="det-meta-item"><span class="det-meta-label">المهنة</span><span class="det-meta-val">${esc(l.profession) || '—'}</span></div>
	          <div class="det-meta-item"><span class="det-meta-label">القسم</span><span class="det-meta-val">${cat.label}</span></div>
	        </div>
        <div class="det-desc-container af s2">
	          <div class="det-desc"><h3 class="det-desc-title">الوصف</h3>${esc(l.desc)}</div>
	          <div class="det-actions">
	            	            <a class="det-wa-btn" href="tel:+${(l.phone||'963983127483').replace(/[^0-9]/g,'')}" style="text-decoration:none;display:flex;align-items:center;justify-content:center;gap:8px;background:#F6921E;color:#fff;border:none;border-radius:14px;padding:14px;font-size:15px;font-weight:800;cursor:pointer;font-family:inherit;width:100%;margin-top:12px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:20px;height:20px"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.11 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg> اتصال مباشر</a>
	          </div>
        </div>
      </div>`;
    
    // nav('detail'); // Removed to prevent double history push
    setTimeout(()=>initCarousels(document.getElementById('detWrap')),150);

  }else{
    // ===== SALE listings - keep original style =====
    let specsHTML=buildDetailSpecs(l,apt);
    
    document.getElementById('detWrap').innerHTML=`
      <div class="det-gallery af">${imgHTML}${dotsHTML}
        <button class="det-back" onclick="goBack(event)">${ICON.back}</button>
        <button class="det-share-top" onclick="event.stopPropagation();shareListing('${l.id}')">${ICON.share}</button>
      </div>
	      <div class="det-content">
	        <div class="det-title af">${esc(l.title)} <span class="det-id">${esc(l.ref||('#'+l.id))}</span></div>
	        <div class="det-meta af s1">
	          <div class="det-meta-item"><span class="det-meta-label">السعر</span><span class="det-meta-val det-meta-price">${fmtPrice(l.price,true)}</span>${usdHTML(l.price)}</div>
	          <div class="det-meta-item"><span class="det-meta-label">الموقع</span><span class="det-meta-val" onclick="openListingMap('${l.id}')" style="cursor:pointer;color:var(--primary)">${l.neighborhood ? esc(l.neighborhood) + ' / ' + esc(l.city) : esc(l.location)}</span></div>
	          <div class="det-meta-item"><span class="det-meta-label">القسم</span><span class="det-meta-val">${cat.label}</span></div>
	          <div class="det-meta-item"><span class="det-meta-label">التفاوض</span><span class="det-meta-val">${l.negotiable ? '<span class="det-meta-neg-yes">✓ قابل للتفاوض</span>' : '<span class="det-meta-neg-no">غير قابل للتفاوض</span>'}</span></div>
	        </div>
	        <div class="det-specs af s2">${specsHTML}</div>
	        ${buildMapSection(l, apt?'موقع العقار':'موقع السيارة')}
	        <div class="det-desc-container af s3">
	          <div class="det-desc"><h3 class="det-desc-title">الوصف</h3>${esc(l.desc)}</div>
	          <div class="det-actions">
	            <button class="det-wa-btn" onclick="submitPurchaseRequest('${l.id}')">إرسال طلب شراء</button>
	            <button class="det-wa-btn" onclick="openChat('${l.id}')" style="background:#fff;color:var(--primary);border:1.5px solid var(--primary);margin-top:12px">تواصل مع الإدارة</button>
	          </div>
	        </div>
	      </div>`;
    
    // nav('detail'); // Removed to prevent double history push
    setTimeout(()=>initCarousels(document.getElementById('detWrap')),150);
  }
}

function buildPartnerSpecs(l){
  var sp='';
  if(l.partnerOffer)  sp+='<div class="det-sp">'+ICON.storage+'<div><div class="sp-label">ما يقدّمه</div><div class="sp-val">'+esc(l.partnerOffer)+'</div></div></div>';
  if(l.partnerSector) sp+='<div class="det-sp">'+ICON.type+'<div><div class="sp-label">المجال</div><div class="sp-val">'+esc(l.partnerSector)+'</div></div></div>';
  if(l.partnerSeek)   sp+='<div class="det-sp">'+ICON.model+'<div><div class="sp-label">يبحث عن</div><div class="sp-val">'+esc(l.partnerSeek)+'</div></div></div>';
  if(l.partnerType)   sp+='<div class="det-sp">'+ICON.share+'<div><div class="sp-label">نوع الشراكة</div><div class="sp-val">'+esc(l.partnerType)+'</div></div></div>';
  if(l.price>0)       sp+='<div class="det-sp">'+ICON.area+'<div><div class="sp-label">رأس المال التقريبي</div><div class="sp-val">'+fmtPrice(l.price)+'</div></div></div>';
  return sp;
}
function buildDetailSpecs(l,apt){
  if(apt){
    return `
      <div class="det-sp">${ICON.bed}<div><div class="sp-label">غرف النوم</div><div class="sp-val">${l.rooms||'—'}</div></div></div>
      <div class="det-sp">${ICON.bath}<div><div class="sp-label">حمامات</div><div class="sp-val">${l.baths||'—'}</div></div></div>
      <div class="det-sp">${ICON.kitchen}<div><div class="sp-label">مطابخ</div><div class="sp-val">${l.kitchens||'—'}</div></div></div>
      <div class="det-sp">${ICON.living}<div><div class="sp-label">غرف معيشة</div><div class="sp-val">${l.living||'—'}</div></div></div>
      <div class="det-sp">${ICON.balcony}<div><div class="sp-label">شرفات</div><div class="sp-val">${l.balconies||'—'}</div></div></div>
      <div class="det-sp">${ICON.storage}<div><div class="sp-label">غرفة تخزين</div><div class="sp-val">${l.storage?'نعم':'لا'}</div></div></div>
      <div class="det-sp">${ICON.area}<div><div class="sp-label">المساحة</div><div class="sp-val">${l.area||'—'} م²</div></div></div>`;
  }else if(isEquip(l.catId)){
    return '';
  }else if(isShop(l.catId)){
    return `
      <div class="det-sp">${ICON.area}<div><div class="sp-label">المساحة</div><div class="sp-val">${l.shopArea?l.shopArea+' م²':'—'}</div></div></div>
      <div class="det-sp">${ICON.storage}<div><div class="sp-label">الطابق</div><div class="sp-val">${l.shopFloor||'—'}</div></div></div>
      <div class="det-sp">${ICON.model}<div><div class="sp-label">عدد الواجهات</div><div class="sp-val">${l.shopFronts||'—'}</div></div></div>
      ${l.shopUse?`<div class="det-sp">${ICON.type}<div><div class="sp-label">يصلح لـ</div><div class="sp-val">${esc(l.shopUse)}</div></div></div>`:''}`;
  }else if(isFarm(l.catId)){
    const isAgri=l.farmType==='أرض زراعية';
    return `
      <div class="det-sp">${ICON.storage}<div><div class="sp-label">نوع الأرض</div><div class="sp-val">${l.farmType||'—'}</div></div></div>
      <div class="det-sp">${ICON.area}<div><div class="sp-label">المساحة</div><div class="sp-val">${l.farmArea?l.farmArea+' م²':'—'}</div></div></div>
      ${l.farmWater?`<div class="det-sp">${ICON.model}<div><div class="sp-label">${isAgri?'مصدر المياه والمرافق':'الخدمات والمرافق'}</div><div class="sp-val">${esc(l.farmWater)}</div></div></div>`:''}
      ${l.farmTrees?`<div class="det-sp">${isAgri?ICON.tree:ICON.floors}<div><div class="sp-label">${isAgri?'عدد الأشجار':'عدد الطوابق المسموح'}</div><div class="sp-val">${l.farmTrees}</div></div></div>`:''}`;
  }else{
    return `
      <div class="det-sp">${ICON.car}<div><div class="sp-label">النوع</div><div class="sp-val">${l.carType||'—'}</div></div></div>
      <div class="det-sp">${ICON.model}<div><div class="sp-label">الموديل</div><div class="sp-val">${l.carModel||'—'}</div></div></div>
      <div class="det-sp">${ICON.type}<div><div class="sp-label">الفئة</div><div class="sp-val">${l.carClass||'—'}</div></div></div>
      <div class="det-sp">${ICON.color}<div><div class="sp-label">اللون</div><div class="sp-val">${l.carColor||'—'}</div></div></div>
      <div class="det-sp">${ICON.year}<div><div class="sp-label">سنة الصنع</div><div class="sp-val">${l.carYear||'—'}</div></div></div>
      ${isRent(l.catId)?'':`<div class="det-sp">${ICON.km}<div><div class="sp-label">المسافة</div><div class="sp-val">${l.carKm?l.carKm.toLocaleString()+' كم':'—'}</div></div></div>`}`;
  }
}

/* تطبيع رقم الهاتف إلى صيغة wa.me الدولية (سوريا 963). يُعيد '' إن لم يوجد رقم. */
function waNumber(p){
  var d = String(p||'').replace(/[^0-9]/g,'');
  if(!d) return '';
  if(d.indexOf('00')===0) d = d.slice(2);          // 00963... → 963...
  if(d.indexOf('963')===0) return d;               // دولي مسبقاً
  if(d.indexOf('0')===0) return '963'+d.slice(1);   // 09xxxxxxxx → 963xxxxxxxx
  if(d.length===9) return '963'+d;                  // 9xxxxxxxx → 963xxxxxxxx
  return d;
}
window.waNumber = waNumber;

/* ===== قالب موحّد بأسلوب Gathern لكل الإعلانات (رأس → معرض → عمودان) ===== */
function gathernDetailHTML(l, cat, imgs, badgeClass){
  var apt = isApt(l.catId);
  var rent = isRent(l.catId);
  var freead = isFreeAd(l.catId);
  var partner = isPartner(l.catId);
  var sale = !rent && !freead && !partner;
  var specsHTML = partner ? buildPartnerSpecs(l) : (freead ? '' : buildDetailSpecs(l, apt));
  var mapHTML = buildMapSection(l);
  window._gdImgs = imgs; window._gdIdx = 0;
  var arrows = imgs.length>1 ? ('<button class="gd-arrow prev" onclick="event.stopPropagation();window._gdNav(1)">'+ICON.prev+'</button><button class="gd-arrow next" onclick="event.stopPropagation();window._gdNav(-1)">'+ICON.next+'</button>') : '';
  var vid = videoEmbedHTML(l.video);
  var gal;
  if(vid){
    // الفيديو محلّ الصورة الكبيرة تماماً (نفس الحدود)، والمصغّرات بجانبه كالمعتاد
    var vThumbs = imgs.slice(0,4).map(function(s,i){ return '<img src="'+s+'" alt="" onclick="openLightbox('+i+')">'; }).join('');
    gal = '<div class="gd-gallery grid has-vid">'
      + '<div class="gd-g-main">'+vid+'</div>'
      + (imgs.length?'<div class="gd-g-thumbs">'+vThumbs+'</div>':'')
      + (imgs.length>4?'<button class="gd-g-all" onclick="openLightbox(0)">عرض كل الصور ('+imgs.length+')</button>':'')
      + '</div>';
  } else if(imgs.length===0){
    gal = '';   // بلا صورة ولا فيديو: لا معرض إطلاقاً
  } else if(imgs.length===1){
    gal = '<div class="gd-gallery one"><div class="gd-g-main"><img id="gdMainImg" src="'+imgs[0]+'" alt="" onclick="openLightbox(0)"></div></div>';
  } else {
    var thumbs = imgs.slice(1,5).map(function(s,i){ return '<img src="'+s+'" alt="" onclick="openLightbox('+(i+1)+')">'; }).join('');
    gal = '<div class="gd-gallery grid">'
      + '<div class="gd-g-main"><img id="gdMainImg" src="'+imgs[0]+'" alt="" onclick="openLightbox(window._gdIdx||0)">'+arrows+'</div>'
      + '<div class="gd-g-thumbs">'+thumbs+'</div>'
      + (imgs.length>5?'<button class="gd-g-all" onclick="openLightbox(0)">عرض كل الصور ('+imgs.length+')</button>':'')
      + '</div>';
  }
  var tags = [];
  tags.push(esc(l.neighborhood ? (l.neighborhood+' / '+l.city) : l.location));
  tags.push(esc(cat.label));
  if(freead){ if(l.profession) tags.push(esc(l.profession)); }
  else if(l.negotiable){ tags.push('قابل للتفاوض'); }
  var tagsHTML = tags.map(function(t){ return '<span class="gd-tag">'+t+'</span>'; }).join('');

  // الخصم والتقييم
  var _pct = discountPct(l);
  var _oldP = _pct>0 ? '<span class="gd-old">'+Number(l.oldPrice).toLocaleString('en-US')+'</span> ' : '';
  var _discBadge = _pct>0 ? '<div class="gd-discount">وفّر '+_pct+'%</div>' : '';
  var _starsHdr = '';  // أُزيل التقييم من داخل صفحة الإعلان

  // بطاقة الحجز حسب نوع الإعلان
  var phoneIco = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:20px;height:20px"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.11 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>';
  var card;
  if(rent){
    // كل الإيجارات: مبدّل يومي / شهري (الشهري بسعر يُتفق عليه، يفتح معالج الحجز)
    card = '<div class="gd-rt">'
      + '<button class="gd-rt-b act" id="gdRtD" onclick="window._gdRt(\'daily\')">يومي</button>'
      + '<button class="gd-rt-b" id="gdRtM" onclick="window._gdRt(\'monthly\')">شهري</button>'
      + '</div>'
      + '<div id="gdDaily">'
      +   _discBadge
      +   '<div class="gd-price">'+_oldP+fmtPrice(l.price,true)+' <small>/ يوم</small></div>'
      +   usdHTML(l.price)
      +   '<div class="gd-dates" id="abSideDates">حدد التواريخ من الروزنامة</div>'
      +   '<button class="gd-btn primary" onclick="handleBookClick()">احجز الآن</button>'
      + '</div>'
      + '<div id="gdMonthly" style="display:none">'
      +   '<div class="gd-price agreed">السعر يُتفق عليه</div>'
      +   '<div class="gd-dates">اختر المدّة ومعلوماتك في الخطوة التالية</div>'
      +   '<button class="gd-btn primary" onclick="window.openBooking(\''+l.id+'\',\'monthly\')">احجز شهرياً</button>'
      + '</div>'
      + '<button class="gd-btn ghost" onclick="openChat(\''+l.id+'\')">تواصل مع الإدارة</button>';
  } else if(sale && l.isAuction && window.auctionCardHTML){
    // مزاد: بطاقة المزايدة اللحظية بدل طلب الشراء
    card = window.auctionCardHTML(l);
  } else if(sale){
    card = _discBadge
      + '<div class="gd-price">'+_oldP+fmtPrice(l.price,true)+'</div>'
      + usdHTML(l.price)
      + '<div class="gd-dates">'+(l.negotiable?'السعر قابل للتفاوض':'السعر نهائي')+'</div>'
      + '<button class="gd-btn primary" onclick="submitPurchaseRequest(\''+l.id+'\')">إرسال طلب شراء</button>'
      + '<button class="gd-btn ghost" onclick="openChat(\''+l.id+'\')">تواصل مع الإدارة</button>';
  } else if(partner){
    // التواصل مباشرةً مع صاحب الإعلان عبر رقم الواتساب الذي وضعه (لا مع الإدارة)
    var _pwa = waNumber(l.phone);
    var _pmsg = encodeURIComponent('مرحباً، أنا مهتمّ بفرصة الشراكة: '+(l.title||''));
    var waIco = '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/></svg>';
    card = '<div class="gd-price free" style="font-size:17px">'+esc(l.partnerOffer||'فرصة شراكة')+'</div>'
      + (l.price>0 ? '<div class="gd-dates">رأس المال التقريبي: '+fmtPrice(l.price)+'</div>' : '<div class="gd-dates">شراكة استثمارية — التفاصيل بالأسفل</div>')
      + (_pwa
          ? '<a class="gd-btn primary" href="https://wa.me/'+_pwa+'?text='+_pmsg+'" target="_blank" rel="noopener" style="text-decoration:none;display:flex;align-items:center;justify-content:center;gap:8px">'+waIco+' تواصل مع صاحب الإعلان</a>'
          : '<button class="gd-btn primary" onclick="openChat(\''+l.id+'\')">أنا مهتمّ — تواصل مع الإدارة</button>');
  } else { // إعلان مجاني — تواصل مباشر مع المعلِن، بلا دردشة
    var tel = '+'+String(l.phone||'963983127483').replace(/[^0-9]/g,'');
    card = '<div class="gd-price free">'+esc(l.profession||'مهن وخدمات')+'</div>'
      + '<div class="gd-dates">تواصل مباشرةً مع المُعلِن</div>'
      + '<a class="gd-btn primary" href="tel:'+tel+'" style="text-decoration:none;display:flex;align-items:center;justify-content:center;gap:8px">'+phoneIco+' اتصال مباشر</a>';
  }
  return ''
    + '<div class="gd">'
    + '<div class="gd-header"><div class="gd-h-row"><h1 class="gd-title">'+esc(l.title)+' <span class="det-id">'+esc(l.ref||('#'+l.id))+'</span></h1>'
    +   '<div class="gd-h-actions">'
    +     '<button class="gd-ico" onclick="shareListing(\''+l.id+'\')" title="مشاركة">'+ICON.share+'</button>'
    +     '<button class="gd-ico fav-btn'+(isFav(l.id)?' on':'')+'" data-id="'+l.id+'" onclick="toggleFav(\''+l.id+'\',event)" title="المفضلة">'+ICON_HEART+'</button>'
    +   '</div></div>'
    +   _starsHdr
    +   '<div class="gd-tags">'+tagsHTML+'</div></div>'
    + gal
    + '<div class="gd-body">'
    +   '<main class="gd-main">'
    +     '<section class="gd-sec"><h3 class="gd-sec-t">الوصف</h3><div class="gd-desc">'+esc(l.desc)+'</div></section>'
    +     (specsHTML?'<section class="gd-sec"><h3 class="gd-sec-t">'+(apt?'المرافق':'المواصفات والمميزات')+'</h3><div class="det-specs">'+specsHTML+'</div></section>':'')
    +     '<section class="gd-sec"><h3 class="gd-sec-t">الموقع</h3>'+mapHTML+'</section>'
    +   '</main>'
    +   '<aside class="gd-booking"><div class="gd-card">'+card+'</div></aside>'
    + '</div>'
    + '</div>';
}
window._gdNav = function(d){
  var n=(window._gdImgs||[]).length; if(n<2) return;
  window._gdIdx=((window._gdIdx||0)+d+n)%n;
  var im=document.getElementById('gdMainImg');
  if(im){ im.src=window._gdImgs[window._gdIdx]; im.setAttribute('onclick','openLightbox('+window._gdIdx+')'); }
};
// مبدّل يومي/شهري في بطاقة الحجز
window._gdRt = function(mode){
  var daily=document.getElementById('gdDaily'), monthly=document.getElementById('gdMonthly');
  var bd=document.getElementById('gdRtD'), bm=document.getElementById('gdRtM');
  if(!daily||!monthly) return;
  var isM=mode==='monthly';
  daily.style.display=isM?'none':''; monthly.style.display=isM?'':'none';
  if(bd) bd.classList.toggle('act',!isM); if(bm) bm.classList.toggle('act',isM);
};
(function(){
  var c = ''
  + '.gd{max-width:1080px;margin:0 auto}'
  + '.gd-g-main{position:relative}'
  + '.gd-arrow{position:absolute;top:50%;transform:translateY(-50%);width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.92);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,.18);z-index:3}'
  + '.gd-arrow svg{width:20px;height:20px;color:#0f172a}'
  + '.gd-arrow.prev{right:24px}.gd-arrow.next{left:24px}'
  + '@media(min-width:1024px){.gd-arrow{display:none}}'
  + '.gd-topbar{display:flex;justify-content:space-between;padding:12px 16px}'
  + '.gd-ico{width:42px;height:42px;border-radius:50%;border:1px solid #e2e8f0;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.06)}'
  + '.gd-ico svg{width:20px;height:20px;color:#475569}'
  + '.gd-header{padding:14px 16px}'
  + '.gd-h-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}'
  + '.gd-h-actions{display:flex;gap:8px;flex-shrink:0}'
  + '.gd-h-actions .gd-ico{width:42px;height:42px}'
  + '.gd-h-actions .gd-ico svg{width:20px;height:20px;color:#475569}'
  + '.fav-btn svg{width:22px;height:22px;fill:none;stroke:#475569;stroke-width:1.8}'
  + '.fav-btn.on svg{fill:#ef4444;stroke:#ef4444}'
  + '.card-fav{position:absolute;top:10px;left:10px;z-index:6;width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.92);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.15)}'
  + '.card-fav svg{width:18px;height:18px}'
  + '.gd-title{font-size:22px;font-weight:900;color:#0f172a;margin:0 0 10px;line-height:1.4}'
  + '.gd-tags{display:flex;flex-wrap:wrap;gap:8px}'
  + '.gd-tag{background:#f1f5f9;color:#475569;padding:5px 11px;border-radius:8px;font-size:12px;font-weight:700}'
  + '.gd-gallery{padding:0 16px;position:relative}'
  + '.gd-gallery img{width:100%;object-fit:cover;cursor:pointer;display:block}'
  + '.gd-gallery.one img,.gd-g-main img{height:300px;border-radius:16px}'
  + '.gd-g-thumbs{display:none}'
  + '.gd-g-all{position:absolute;bottom:12px;left:28px;background:rgba(0,0,0,.7);color:#fff;border:none;border-radius:10px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}'
  + '.gd-body{padding:18px 16px 70px;display:flex;flex-direction:column;gap:22px}'
  + '.gd-booking{order:-1}'
  + '.gd-card{background:#fff;border:1px solid #eef2f7;border-radius:18px;padding:20px;box-shadow:0 6px 24px rgba(0,0,0,.08)}'
  + '.gd-price{font-size:24px;font-weight:900;color:#0f172a;text-align:center}'
  + '.gd-price small{font-size:13px;color:#94a3b8;font-weight:600}'
  + '.gd-price.free{font-size:19px;color:#16a34a}'
  + '.gd-price.agreed{font-size:18px;color:var(--primary,#0D9488)}'
  + '.gd-rt{display:flex;gap:6px;background:#f1f5f9;border-radius:13px;padding:4px;margin-bottom:14px}'
  + '.gd-rt-b{flex:1;border:none;background:transparent;padding:10px;border-radius:10px;font-weight:800;font-size:13px;color:#64748b;cursor:pointer;font-family:inherit}'
  + '.gd-rt-b.act{background:#fff;color:#0f172a;box-shadow:0 1px 5px rgba(0,0,0,.09)}'
  + '.gd-dates{font-size:13px;color:#64748b;text-align:center;margin:8px 0 16px;padding-bottom:14px;border-bottom:1px solid #f1f5f9}'
  + '.gd-btn{width:100%;padding:15px;border:none;border-radius:13px;font-size:16px;font-weight:800;cursor:pointer;font-family:inherit;margin-top:10px}'
  + '.gd-btn.primary{background:#F6921E;color:#fff;margin-top:0}'
  + '.gd-btn.ghost{background:#fff;color:var(--primary,#0D9488);border:1.5px solid var(--primary,#0D9488)}'
  + '.gd-sec-t{font-size:17px;font-weight:800;color:#0f172a;margin:0 0 12px}'
  + '.gd-sec + .gd-sec{margin-top:26px}'
  + '.gd-video{position:relative;width:100%;aspect-ratio:16/9;border-radius:16px;overflow:hidden;background:#000;box-shadow:0 6px 24px rgba(0,0,0,.14)}'
  + '.gd-video iframe{position:absolute;inset:0;width:100%;height:100%;border:0}'
  + '.gd-vid-fs{position:absolute;top:10px;left:10px;z-index:3;width:38px;height:38px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);color:#fff;border:0;border-radius:10px;cursor:pointer;backdrop-filter:blur(4px);transition:background .2s}'
  + '.gd-vid-fs:hover{background:rgba(0,0,0,.8)}'
  + '.gd-vid-fs svg{width:20px;height:20px}'
  /* الفيديو يحافظ على أبعاده الطبيعية (16/9) بلا قصّ ولا أشرطة سوداء */
  + '.gd-g-main .gd-video{width:100%;aspect-ratio:16/9;height:auto}'
  + '@media(min-width:1024px){.gd-g-main .gd-video{border-radius:18px}}'
  /* الموبايل: عند وجود فيديو، أظهر الصور كشريط مصغّرات أفقي أسفله */
  + '@media(max-width:1023px){.gd-gallery.has-vid .gd-g-thumbs{display:flex;gap:8px;overflow-x:auto;margin-top:10px;padding-bottom:4px;-webkit-overflow-scrolling:touch}.gd-gallery.has-vid .gd-g-thumbs img{width:88px;height:62px;border-radius:10px;flex-shrink:0;object-fit:cover}.gd-gallery.has-vid .gd-g-all{display:none}}'
  + '.gd-desc{font-size:15.5px;color:#374151;line-height:2.1;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;background:#f8fafc;border:1px solid #eef2f7;border-radius:14px;padding:18px;min-height:110px}'
  + '.gd-main{overflow:hidden}'
  + '.gd-title{overflow-wrap:anywhere}'
  + '.det-desc,.l-desc,.l-title{overflow-wrap:anywhere;word-break:break-word}'
  + '@media(min-width:1024px){'
  +   '.gd-gallery.grid{display:flex;gap:10px;height:440px;padding:0}'
  +   '.gd-gallery.grid.has-vid{height:auto;align-items:stretch}'   /* مع وجود فيديو: ارتفاع تلقائي يحافظ على أبعاد الفيديو */
  +   '.gd-g-main{flex:2}.gd-g-main img{height:440px;border-radius:18px}'
  +   '.gd-g-thumbs{display:grid;flex:1;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:10px}'
  +   '.gd-g-thumbs img{height:100%;border-radius:14px}'
  +   '.gd-gallery{padding:0}'
  +   '.gd-body{flex-direction:row;align-items:flex-start;gap:30px;padding:24px 0 60px}'
  +   '.gd-main{flex:1;order:1;min-width:0}'
  +   '.gd-booking{flex:0 0 340px;order:2;position:sticky;top:80px}'
  + '}';
  var s=document.createElement('style'); s.textContent=c; document.head.appendChild(s);
})();

/* ===== MONTHLY/DAILY RENT TOGGLE ===== */
let _selectedMonths=null;
let _monthlyPrice=0;

function switchRentType(type,price){
  document.getElementById('rtDaily').classList.toggle('act',type==='daily');
  document.getElementById('rtMonthly').classList.toggle('act',type==='monthly');
  document.getElementById('dailySection').style.display=type==='daily'?'':'none';
  document.getElementById('monthlySection').style.display=type==='monthly'?'':'none';
  // Update price display
  const priceEl=document.getElementById('aptRentPrice');
  if(type==='monthly'){
    priceEl.innerHTML=fmtPrice(price*30,true)+' <small>/ شهر</small>';
  }else{
    priceEl.innerHTML=fmtPrice(price,true)+' <small>/ يوم</small>';
  }
  // Update mobile bar
  const barPrice=document.getElementById('abBarPrice');
  if(barPrice){
    if(type==='monthly') barPrice.innerHTML=fmtPrice(price*30,true)+' <small style="font-size:12px;font-weight:500;color:#737373">/ شهر</small>';
    else barPrice.innerHTML=fmtPrice(price,true)+' <small style="font-size:12px;font-weight:500;color:#737373">/ يوم</small>';
  }
}

function initMonthlyGrid(dailyPrice){
  _monthlyPrice=dailyPrice*30;
  _selectedMonths=null;
  const sel=document.getElementById('monthlySelect');
  let html='<option value="">— اختر مدة الإيجار —</option>';
  for(let i=1;i<=24;i++){
    html+=`<option value="${i}">${i} شهر</option>`;
  }
  html+=`<option value="-1">∞ مدة غير محددة</option>`;
  sel.innerHTML=html;
  document.getElementById('monthlySummary').style.display='none';
  document.getElementById('monthlyBookForm').style.display='none';
}

function selectMonth(val,dailyPrice){
  const m=parseInt(val);
  if(!val||isNaN(m)){_selectedMonths=null;document.getElementById('monthlySummary').style.display='none';document.getElementById('monthlyBookForm').style.display='none';return;}
  _selectedMonths=m;
  const mp=dailyPrice*30;
  const sum=document.getElementById('monthlySummary');
  sum.style.display='block';
  document.getElementById('monthlyBookForm').style.display='block';
  if(m===-1){
    document.getElementById('monthlyDuration').textContent='مدة غير محددة';
    document.getElementById('monthlyTotal').textContent='يُتفق عليه';
  }else{
    document.getElementById('monthlyDuration').textContent=m+' شهر';
    document.getElementById('monthlyTotal').textContent=fmtPrice(mp*m);
  }
  const barPrice=document.getElementById('abBarPrice');
  const barDates=document.getElementById('abBarDates');
  if(barPrice && m!==-1) barPrice.innerHTML=fmtPrice(mp*m)+' <small style="font-size:12px;font-weight:500;color:#737373">/ '+m+' شهر</small>';
  else if(barPrice) barPrice.innerHTML=fmtPrice(mp)+' <small style="font-size:12px;font-weight:500;color:#737373">/ شهر</small>';
  if(barDates) barDates.textContent=m===-1?'مدة مفتوحة':m+' شهر';
}

function submitMonthlyBooking(id){
  const l=listings.find(x=>String(x.id)===String(id))||window._currentListing;if(!l)return;
  const name=document.getElementById('mbfName').value.trim();
  const last=document.getElementById('mbfLast').value.trim();
  const phone=document.getElementById('mbfPhone').value.trim();
  if(!name||!phone){window.uiToast('يرجى تعبئة الاسم ورقم الهاتف','error');return;}
  if(_selectedMonths === undefined || _selectedMonths === null){window.uiToast('يرجى اختيار مدة الإيجار','error');return;}
  const cat=getCat(l.catId);
  let msg='📋 طلب إيجار شهري\n';
  if(l.ref) msg+='رمز الإعلان: '+l.ref+'\n';
  msg+='الإعلان: '+l.title+'\n';
  msg+='القسم: '+cat.label+'\n';
  msg+='الموقع: '+l.location+'، جبلة\n';
  msg+='\nتفاصيل الإيجار:\n';
  msg+='• النوع: شهري\n';
  msg+='• المدة: '+(_selectedMonths===-1?'غير محددة':_selectedMonths+' شهر')+'\n';
  msg+='• الإيجار الشهري: '+fmtPrice(l.price*30)+'\n';
  if(_selectedMonths>0) msg+='• الإجمالي: '+fmtPrice(l.price*30*_selectedMonths)+'\n';
  else msg+='• الإجمالي: يُتفق عليه\n';
  msg+='\nمعلوماتي:\n';
  msg+='• الاسم: '+name+' '+last+'\n';
  msg+='• الهاتف: '+phone+'\n';
  msg+='\nبانتظار تأكيدكم، شكراً 🙏';
  if (window.submitBookingRequest) {
    submitBookingRequest({
      adId:l.id, adRef:l.ref||'', adTitle:l.title||'', adCatId:l.catId||'', adImage:(l.images&&l.images[0])||'',
      dealType:'monthly', months:(_selectedMonths>0?_selectedMonths:null),
      priceDaily:l.price, totalPrice:(_selectedMonths>0?l.price*30*_selectedMonths:null),
      clientName:(name+' '+last).trim(), clientPhone:phone, summary:msg
    });
  }
}

function closeRentDetail(){
  const bar=document.getElementById('abBottomBar');
  if(bar)bar.remove();
  goBack();
}

function scrollToCal(){
  const el=document.getElementById('calSection');
  if(el)el.scrollIntoView({behavior:'smooth',block:'center'});
}

// إرسال طلب شراء لإعلان بيع
function submitPurchaseRequest(id){
  var l=listings.find(x=>String(x.id)===String(id))||window._currentListing; if(!l)return;
  // افتح معالج الطلب (معلومات كاملة ثم مراجعة) بوضع الشراء
  if(window.openBooking){ openBooking(l.id, 'sale'); return; }
  if(window.submitBookingRequest) submitBookingRequest({
    adId:l.id, adRef:l.ref||'', adTitle:l.title||'', adCatId:l.catId||'', adImage:(l.images&&l.images[0])||'',
    dealType:'sale', priceDaily:null, totalPrice:l.price||null
  });
}

// تعبئة نماذج الحجز/التواصل تلقائياً من معلومات حساب المستخدم (مثل Airbnb)
function prefillContactFields(){
  var info = (window.currentUserInfo && window.currentUserInfo()) || null;
  if(!info) return;
  var parts = (info.name||'').trim().split(/\s+/);
  var first = parts.shift() || '';
  var last = parts.join(' ');
  var setv = function(id,v){ var el=document.getElementById(id); if(el && !el.value) el.value = v||''; };
  setv('bfName',first); setv('bfLast',last); setv('bfPhone',info.phone); setv('bfAddress',info.address);
  setv('mbfName',first); setv('mbfLast',last); setv('mbfPhone',info.phone);
}

function handleBookClick(){
  // افتح نافذة الحجز متعدّدة الخطوات (ملء الشاشة)
  var l = window._currentListing;
  if(window.openBooking && l){ openBooking(l.id); }
}
// كشف دالة تحديث الأيام المعطّلة لنافذة الحجز
window.refreshBlockedDates = function(){ return (typeof loadBlockedDates==='function') ? loadBlockedDates() : Promise.resolve(); };

function submitBooking(id){
  const l=listings.find(x=>String(x.id)===String(id))||window._currentListing;if(!l)return;
  const name=document.getElementById('bfName').value.trim();
  const last=document.getElementById('bfLast').value.trim();
  const phone=document.getElementById('bfPhone').value.trim();
  const address=document.getElementById('bfAddress').value.trim();
  const email=(document.getElementById('bfEmail')||{value:''}).value.trim();
  
  if(!name||!last||!phone){
    // highlight required fields
    ['bfName','bfLast','bfPhone'].forEach(fid=>{
      const el=document.getElementById(fid);
      if(!el.value.trim()){el.style.borderColor='var(--rose)';setTimeout(()=>el.style.borderColor='#f0f0f0',2000);}
    });
    return;
  }
  
  const d=(_calStart&&_calEnd)?Math.round((_calEnd-_calStart)/864e5)+1:0;
  const cat=getCat(l.catId);
  let msg='📋 طلب حجز جديد\n';
  if(l.ref) msg+='رمز الإعلان: '+l.ref+'\n';
  msg+='الإعلان: '+l.title+'\n';
  msg+='القسم: '+cat.label+'\n';
  msg+='الموقع: '+l.location+'، جبلة\n';
  if(_calStart&&_calEnd){
    msg+='\nتفاصيل الحجز:\n';
    msg+='• من: '+fmtDate(_calStart)+'\n';
    msg+='• إلى: '+fmtDate(_calEnd)+'\n';
    msg+='• المدة: '+d+' يوم\n';
    msg+='• السعر اليومي: '+fmtPrice(l.price)+'\n';
    msg+='• الإجمالي: '+fmtPrice(l.price*d)+'\n';
  }
  msg+='\nمعلوماتي:\n';
  msg+='• الاسم: '+name+' '+last+'\n';
  msg+='• الهاتف: '+phone+'\n';
  if(address)msg+='• العنوان: '+address+'\n';
  if(email)msg+='• الإيميل: '+email+'\n';
  msg+='\nبانتظار تأكيدكم، شكراً 🙏';
  
  if (window.submitBookingRequest) {
    var _iso=function(dt){return dt?dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0'):null;};
    submitBookingRequest({
      adId:l.id, adRef:l.ref||'', adTitle:l.title||'', adCatId:l.catId||'', adImage:(l.images&&l.images[0])||'',
      dealType:'rent', dateFrom:_iso(_calStart), dateTo:_iso(_calEnd), days:d,
      priceDaily:l.price, totalPrice:(_calStart&&_calEnd?l.price*d:null),
      clientName:(name+' '+last).trim(), clientPhone:phone, clientAddress:address, summary:msg
    });
  }
}

function showBookConfirm(){
  const old=document.getElementById('bookConfirmOverlay');
  if(old)old.remove();
  const ov=document.createElement('div');
  ov.id='bookConfirmOverlay';
  ov.className='book-confirm-overlay';
  ov.innerHTML=`<div class="book-confirm-box">
    <div class="bc-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
    <h3>تم إرسال طلب الحجز!</h3>
    <p>سيتم تأكيد الحجز من قبلنا عبر اتصال هاتفي أو رسالة واتساب أو إيميل</p>
    <button class="bc-close" onclick="document.getElementById('bookConfirmOverlay').remove()">حسناً</button>
  </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click',e=>{if(e.target===ov)ov.remove();});
}

function openMap(loc){
  const q=encodeURIComponent(loc+' جبلة سوريا');
  window.open('https://www.google.com/maps/search/'+q,'_blank');
}
// استخراج إحداثيات (lat,lng) من رابط خرائط غوغل إن وُجدت
function parseLatLng(url){
  if(!url) return null;
  var s=String(url);
  var m = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
       || s.match(/[?&](?:q|ll|query|center|destination)=(-?\d+\.\d+),(-?\d+\.\d+)/)
       || s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
       || s.match(/\/(-?\d+\.\d+),(-?\d+\.\d+)/);
  return m ? {lat:parseFloat(m[1]), lng:parseFloat(m[2])} : null;
}
// فتح موقع الإعلان: رابط الأدمن إن وُجد، وإلا البحث التلقائي بالحي
function openListingMap(id){
  var l=listings.find(function(x){return String(x.id)===String(id);});
  if(l && l.mapUrl) window.open(l.mapUrl,'_blank');
  else if(l) openMap(l.location);
}
window.openListingMap=openListingMap;

function buildMapSection(l, label){
  label = label || 'موقع العقار';
  var loc=(l&&l.location)||'';
  var mapUrl=(l&&l.mapUrl)||'';
  const c=(mapUrl && parseLatLng(mapUrl)) || LOC_COORDS[loc] || {lat:35.3614,lng:35.9264};
  const sub = mapUrl ? 'الموقع المحدّد من الإدارة' : (loc+'، جبلة');
  return `<div class="det-map-section af s2">
    <h3 class="det-map-title">${ICON.pin} ${label}</h3>
    <p class="det-map-sub">${esc(sub)}</p>
    <div class="det-map-wrap" onclick="openListingMap('${l.id}')">
      <iframe src="https://www.openstreetmap.org/export/embed.html?bbox=${c.lng-.008}%2C${c.lat-.005}%2C${c.lng+.008}%2C${c.lat+.005}&layer=mapnik&marker=${c.lat}%2C${c.lng}" frameborder="0" scrolling="no" loading="lazy" style="width:100%;height:100%;border:0;border-radius:16px;pointer-events:none"></iframe>
      <div class="det-map-overlay">
        <div class="det-map-pin">
          <svg viewBox="0 0 24 24" fill="var(--primary)" stroke="#fff" stroke-width="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3" fill="#fff"/></svg>
        </div>
      </div>
      <button class="det-map-expand">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
      </button>
    </div>
    <p class="det-map-hint">اضغط على الخريطة لفتحها في خرائط غوغل</p>
  </div>`;
}

function openWA(id){
  const l=listings.find(x=>String(x.id)===String(id))||window._currentListing;if(!l)return;
  const cat=getCat(l.catId);const apt=isApt(l.catId);const rent=isRent(l.catId);const eq=isEquip(l.catId);
  const freead=isFreeAd(l.catId);
  let msg='السلام عليكم 👋\n';
  msg+='أنا مهتم بالإعلان التالي:\n';
  if(l.ref) msg+='🔖 رمز الإعلان: '+l.ref+'\n';msg+='\n';
  msg+='📌 *'+l.title+'*\n';
  msg+='🏷️ '+cat.label+'\n';
  msg+='💰 '+fmtPrice(l.price)+(rent?' / يوم':'')+'\n';
  msg+='📍 '+l.location+'، جبلة\n';
  if(apt){msg+='🛏️ '+l.rooms+' غرف | 🚿 '+l.baths+' حمام | 📐 '+l.area+' م²\n';}
  else if(isShop(l.catId)){msg+='🏬 '+(l.shopArea?l.shopArea+' م²':'')+(l.shopFloor?' | الطابق: '+l.shopFloor:'')+'\n';}
  else if(isFarm(l.catId)){msg+='🌳 '+(l.farmType||'أرض')+(l.farmArea?' | '+l.farmArea+' م²':'')+'\n';}
  else if(!eq&&!freead){msg+='🚗 '+l.carType+' '+l.carModel+' | 📅 '+l.carYear+'\n';}
  if(_calStart&&_calEnd){
    const d=Math.round((_calEnd-_calStart)/864e5)+1;
    msg+='\n📆 *تفاصيل الحجز:*\n';
    msg+='▫️ من: '+fmtDate(_calStart)+'\n';
    msg+='▫️ إلى: '+fmtDate(_calEnd)+'\n';
    msg+='▫️ المدة: '+d+' يوم\n';
    msg+='▫️ الإجمالي: '+fmtPrice(l.price*d)+'\n';
  }
  msg+='\nأرجو التواصل معي لمزيد من التفاصيل 🙏\nشكراً لكم ✨';
  const targetPhone = freead ? (l.phone||'963983127483').replace(/[^0-9]/g,'') : '963983127483';
  const waUrl = 'https://wa.me/' + targetPhone + '?text=' + encodeURIComponent(msg);
  const win = window.open(waUrl, '_blank');
  if(!win) window.location.href = waUrl;
}

function shareListing(id){
  const l=listings.find(x=>String(x.id)===String(id))||window._currentListing;if(!l)return;
  const cat=getCat(l.catId);const apt=isApt(l.catId);const rent=isRent(l.catId);const eq=isEquip(l.catId);
  const shareUrl=window.location.origin+window.location.pathname+'?id='+l.id;
  let text='✨ *'+esc(l.title)+'* ✨\n\n';
  text+='🏷️ '+cat.label+'\n';
  text+='💰 '+fmtPrice(l.price)+(rent?' / يوم':'')+'\n';
  text+='📍 '+l.location+'، جبلة\n';
  var _mapLink=l.mapUrl||('https://www.google.com/maps/search/'+encodeURIComponent(l.location+' جبلة سوريا'));
  text+='🗺️ الموقع على الخريطة: '+_mapLink+'\n\n';
  if(apt){text+='🛏️ '+l.rooms+' غرف نوم\n🚿 '+l.baths+' حمام\n📐 '+l.area+' م²\n\n';}
  else if(isShop(l.catId)){
    if(l.shopArea)text+='📐 المساحة: '+l.shopArea+' م²\n';
    if(l.shopFloor)text+='🏬 الطابق: '+l.shopFloor+'\n';
    if(l.shopUse)text+='🛠️ يصلح لـ: '+l.shopUse+'\n';
    text+='\n';
  }
  else if(isFarm(l.catId)){
    if(l.farmType)text+='🌳 نوع الأرض: '+l.farmType+'\n';
    if(l.farmArea)text+='📐 المساحة: '+l.farmArea+' م²\n';
    if(l.farmWater)text+='💧 '+l.farmWater+'\n';
    text+='\n';
  }
  else if(!eq){
    text+='🚗 '+(l.carType||'')+'\n';
    if(l.carYear)text+='📅 سنة الصنع: '+l.carYear+'\n';
    if(l.carColor)text+='🎨 اللون: '+l.carColor+'\n';
    text+='\n';
  }
  if(l.desc)text+='📝 '+l.desc+'\n\n';
  text+='🔗 '+shareUrl;
  if(navigator.share){
    navigator.share({title:l.title,text:text,url:shareUrl}).catch(function(e){
      if(e&&e.name!=='AbortError'){
        window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank');
      }
    });
  } else {
    window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank');
  }
}

// زر الرجوع الذكي
function goBack(e){
  if(e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const bar = document.getElementById('abBottomBar');
  if(bar) bar.remove();
  const ov = document.getElementById('bookConfirmOverlay');
  if(ov) ov.remove();
  window._currentListing = null;
  _skipPush = true;
  if (history.state && history.state.page === 'detail') {
    history.back();
  } else {
    nav('home');
  }
}

// ===== BLOCKED DATES FROM ADMIN (جدول blocked_days) =====
let _adminBlockedDates = {};
async function loadBlockedDates() {
  try {
    const { data } = await supabaseClient.from('blocked_days').select('ad_id, day');
    const map = {};
    (data || []).forEach(r => { (map[r.ad_id] = map[r.ad_id] || []).push(r.day); });
    _adminBlockedDates = map;
  } catch(e) { console.error('Error loading blocked dates:', e); }
}
if (USE_FIREBASE) { loadBlockedDates(); }

function initCalendar(price){
  _calPrice=price;const n=new Date();calY=n.getFullYear();calM=n.getMonth();_calStart=null;_calEnd=null;
  if (USE_FIREBASE) {
    loadBlockedDates().then(renderCal).catch(renderCal);
  } else { renderCal(); }
}
function calPrev(){calM--;if(calM<0){calM=11;calY--;}renderCal();}
function calNext(){calM++;if(calM>11){calM=0;calY++;}renderCal();}
function clearCal(){_calStart=null;_calEnd=null;renderCal();}
function renderCal(){
  document.getElementById('calMonth').textContent=MONTHS[calM]+' '+calY;
  const fd=new Date(calY,calM,1).getDay(),dm=new Date(calY,calM+1,0).getDate(),td=new Date();td.setHours(0,0,0,0);
  // Get booked dates for current listing
  const _bookedDates=JSON.parse(localStorage.getItem('tam_booked')||'{}');
  const lid=window._currentListing?window._currentListing.id:null;
  const booked=lid?(_bookedDates[lid]||[]):[];
  const adminBlocked=lid?(_adminBlockedDates[lid]||[]):[];
  const allBlocked=[...booked,...adminBlocked];
  let h=DAYS.map(d=>`<div class="cal-dn">${d}</div>`).join('');
  for(let i=0;i<fd;i++)h+=`<div class="cal-d emp"><span class="cd-in"></span></div>`;
  
  let activeDaysCount = 0;
  if(_calStart && _calEnd) {
    let temp = new Date(_calStart);
    while(temp <= _calEnd) {
      const key = temp.getFullYear()+'-'+(temp.getMonth()+1).toString().padStart(2,'0')+'-'+temp.getDate().toString().padStart(2,'0');
      if(!allBlocked.includes(key)) activeDaysCount++;
      temp.setDate(temp.getDate()+1);
    }
  } else if(_calStart) {
    activeDaysCount = 1;
  }

  for(let d=1;d<=dm;d++){
    const dt=new Date(calY,calM,d),past=dt<td;
    const key=calY+'-'+(calM+1).toString().padStart(2,'0')+'-'+d.toString().padStart(2,'0');
    const isBooked=allBlocked.includes(key);
    let cl='cal-d';
    if(past) cl+=' dis';
    else if(isBooked) cl+=' booked';
    
    if(_calStart&&_calEnd){
      const t=dt.getTime(),s=_calStart.getTime(),e=_calEnd.getTime();
      if(t===s&&t===e)cl+=' sel rs re';else if(t===s)cl+=' rs';else if(t===e)cl+=' re';else if(t>s&&t<e)cl+=' inr';
    }else if(_calStart&&dt.getTime()===_calStart.getTime())cl+=' sel';
    
    h+=`<div class="${cl}" ${past?'':`onclick="pickDay(${calY},${calM},${d})"`}><span class="cd-in">${d}</span></div>`;
  }
  document.getElementById('calGrid').innerHTML=h;
  const sm=document.getElementById('calSummary');
  if(_calStart&&_calEnd){
    sm.style.display='block';
    document.getElementById('calFrom').textContent=fmtDate(_calStart);
    document.getElementById('calTo').textContent=fmtDate(_calEnd);
    document.getElementById('calDays').textContent=activeDaysCount;
    document.getElementById('calTotal').textContent=fmtPrice(_calPrice*activeDaysCount);
  }else{sm.style.display='none';}
  // Update bottom bar dates and price
  const barDates=document.getElementById('abBarDates');
  const barPrice=document.getElementById('abBarPrice');
  const sidePrice=document.getElementById('abSidePrice');
  const sideDates=document.getElementById('abSideDates');
  if(_calStart&&_calEnd){
    if(barDates){barDates.textContent=fmtDate(_calStart)+' – '+fmtDate(_calEnd)+' ('+activeDaysCount+' يوم)';barDates.style.color='#525252';}
    if(barPrice)barPrice.innerHTML=fmtPrice(_calPrice*activeDaysCount)+' <small style="font-size:12px;font-weight:500;color:#737373">/ '+activeDaysCount+' يوم</small>';
    if(sidePrice)sidePrice.innerHTML=fmtPrice(_calPrice*activeDaysCount)+' <small>/ '+activeDaysCount+' يوم</small>';
    if(sideDates)sideDates.textContent=fmtDate(_calStart)+' – '+fmtDate(_calEnd);
  }else{
    if(barDates){barDates.textContent='حدد التواريخ';barDates.style.color='#F6921E';}
    if(barPrice)barPrice.innerHTML=fmtPrice(_calPrice)+' <small style="font-size:12px;font-weight:500;color:#737373">/ يوم</small>';
    if(sidePrice)sidePrice.innerHTML=fmtPrice(_calPrice)+' <small>/ يوم</small>';
    if(sideDates)sideDates.textContent='حدد التواريخ من الروزنامة';
  }
}
function pickDay(y,m,d){
  const dt=new Date(y,m,d);
  if(!_calStart||(_calStart&&_calEnd)){
    _calStart=dt;_calEnd=null;
  }else{
    if(dt < _calStart){ _calEnd = _calStart; _calStart = dt; }
    else _calEnd = dt;
  }
  renderCal();
}
function fmtDate(d){return d.getDate()+' '+MONTHS[d.getMonth()]+' '+d.getFullYear();}

/* ===== SEARCH SUGGESTIONS ===== */
function showSuggestions(q){
  const box=document.getElementById('searchSuggestions');
  if(!box)return;
  q=q.trim();
  if(!q){box.classList.remove('open');box.innerHTML='';return;}
  
  const matched=listings.filter(l=>{
    return l.title.includes(q)||l.desc.includes(q)||l.location.includes(q)||(l.carType||'').includes(q)||(l.carModel||'').includes(q);
  }).slice(0,6);
  
  // Also match locations
  const locMatched=LOCS.filter(loc=>loc.includes(q)).slice(0,3);
  
  if(!matched.length&&!locMatched.length){box.classList.remove('open');box.innerHTML='';return;}
  
  let html='';
  locMatched.forEach(loc=>{
    html+=`<div class="sug-item" onclick="document.getElementById('heroSearch').value='${loc}';closeSuggestions();doSearch()">
      <div class="sug-icon loc"><svg viewBox="0 0 24 24" fill="currentColor" style="width:20px;height:20px"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"/></svg></div>
      <div class="sug-text"><h4>${loc}</h4><p>موقع</p></div>
    </div>`;
  });
  matched.forEach(l=>{
    const sugThumb=l.images&&l.images.length?l.images[0]:'';
    html+=`<div class="sug-item" onclick="closeSuggestions();viewDetail('${l.id}')">
      <div class="sug-thumb"><img src="${sugThumb}" alt="${esc(l.title)}" loading="lazy"></div>
      <div class="sug-text"><h4>${esc(l.title)}</h4><p>${esc(l.location)} · ${fmtPrice(l.price)}</p></div>
    </div>`;
  });
  box.innerHTML=html;
  box.classList.add('open');
}
function closeSuggestions(){
  const box=document.getElementById('searchSuggestions');
  if(box){box.classList.remove('open');box.innerHTML='';}
}
document.addEventListener('click',e=>{
  if(!e.target.closest('.search-wrap'))closeSuggestions();
});

/* ===== SEARCH ===== */
function doSearch(){sQ=document.getElementById('heroSearch').value.trim();sC=null;sType=null;nav('listings');}

/* ===== SIDE MENU ===== */
function openMenu(){
  document.getElementById('menuOverlay').classList.add('open');
  document.getElementById('sideMenu').classList.add('open');
}
function closeMenu(){
  document.getElementById('menuOverlay').classList.remove('open');
  document.getElementById('sideMenu').classList.remove('open');
}

/* ===== LAPTOP NAVIGATION ===== */
function showLaptopNav(){
  if(window.innerWidth >= 1024){
    document.querySelectorAll('.laptop-nav-item').forEach(item => item.style.display = 'flex');
  }
}
function hideLaptopNav(){
  if(window.innerWidth < 1024){
    document.querySelectorAll('.laptop-nav-item').forEach(item => item.style.display = 'none');
  }
}
window.addEventListener('resize',()=>{
  if(window.innerWidth>=1024)showLaptopNav();
  else hideLaptopNav();
});


// Free Ad Modal Functions
var FREE_TERMS=[
  'هذا القسم <b>للأفراد فقط</b> (مهن حرّة وأسر منتجة) — لا للشركات والمعارض والمؤسسات، وتُحذف إعلاناتهم.',
  'ألتزم باسمي الحقيقي ورقم هاتف صحيح مفعّل، و<b>صور حقيقية من عملي</b> (لا صور من الإنترنت).',
  'ألتزم بالنظافة ومعايير السلامة (خاصة الأغذية)، ولا أعرض منتجات مخالفة للقانون أو أدوية أو مجهولة المصدر.',
  'أفهم أن منصّة «تم» <b>وسيط إعلاني فقط</b>، وليست مسؤولة عن الجودة أو التعاملات المالية أو الخلافات أو الأضرار، وأنّ الاتفاق على السعر والتسليم بيني وبين العميل.',
  'أوافق على حقّ الإدارة في تحديد عدد الإعلانات المجانية شهرياً، وحذف الإعلان أو حظر الحساب عند المخالفة أو الشكاوى.',
  'أوافق على أن هذه الشروط قد تتغيّر وتسري فور نشرها.'
];
function openFreeAdTermsModal(){ openTermsModal(termsListHTML('شروط النشر في «مهن وخدمات»', FREE_TERMS), 'شروط النشر وسياسة الخصوصية', function(){ markTermsRead('freead'); }); }
window.openFreeAdTermsModal=openFreeAdTermsModal;
function renderFreeAdTerms(){
  var box=document.getElementById('freeAdTerms'); if(!box) return;
  _termsRead.freead=false;   // يجب قراءة الشروط قبل تفعيل الموافقة
  box.innerHTML='<p style="font-size:13px;color:#475569;margin:0 0 10px">قسم مجاني بالكامل لدعم أصحاب المهن والأسر المنتجة — بلا رسوم ولا عمولة.</p>'
    +'<div class="terms-agree-one"><label class="fa-term"><input type="checkbox" id="faAgree" class="fa-term-chk" disabled onchange="faTermsCheck()"><span>أوافق على <a class="terms-link" onclick="event.preventDefault();event.stopPropagation();openFreeAdTermsModal()">شروط النشر وسياسة الخصوصية</a> لطلبك تم</span></label><div class="terms-readhint" id="faReadHint">اضغط «شروط النشر» واقرأها حتى النهاية لتتمكّن من الموافقة</div></div>'
    +'<div style="color:#E11D48;font-size:12px;font-weight:700;margin-top:10px;background:rgba(225,29,72,.08);padding:9px 12px;border-radius:10px">ملاحظة: قسم مهن وخدمات لا يتضمّن الإعلان عن الشقق والسيارات والمُعدات.</div>';
}
function openFreeAdModal() {
  if(!requireLogin()) return;
  document.getElementById('freeAdModalOverlay').classList.add('show');
  renderFreeAdTerms();
  faTermsCheck();
  backToTerms();
}
// تفعيل زرّ «متابعة» فقط بعد وضع ✓ على الموافقة
function faTermsCheck() {
  var agree = document.getElementById('faAgree');
  var ok = !!(agree && agree.checked);
  var btn = document.getElementById('faContinueBtn'); if (!btn) return;
  btn.disabled = !ok;
  btn.style.opacity = ok ? '1' : '.5';
  btn.style.pointerEvents = ok ? 'auto' : 'none';
}
window.faTermsCheck = faTermsCheck;
function closeFreeAdModal() {
  document.getElementById('freeAdModalOverlay').classList.remove('show');
}
function showFreeAdForm() {
  document.getElementById('freeAdModalTitle').textContent = 'إضافة مهنة أو خدمة';
  document.getElementById('freeAdTerms').style.display = 'none';
  document.getElementById('freeAdTermsBtns').style.display = 'none';
  document.getElementById('freeAdForm').classList.add('show');
  document.getElementById('freeAdFormBtns').style.display = 'flex';
  faGroupChange();
}
function faGroupChange() {
  const g = (document.getElementById('faFreeGroup') || {}).value || 'handy';
  const list = g === 'home' ? FREE_HOME : FREE_HANDY;
  const sel = document.getElementById('faProfession');
  if (sel) sel.innerHTML = '<option value="">اختر المهنة...</option>' + list.map(p => '<option value="' + p + '">' + p + '</option>').join('') + '<option value="أخرى">أخرى</option>';
  toggleOtherProfession();
}
window.faGroupChange = faGroupChange;
function backToTerms() {
  document.getElementById('freeAdModalTitle').textContent = 'شروط النشر في مهن وخدمات';
  document.getElementById('freeAdTerms').style.display = 'block';
  document.getElementById('freeAdTermsBtns').style.display = 'flex';
  document.getElementById('freeAdForm').classList.remove('show');
  document.getElementById('freeAdFormBtns').style.display = 'none';
}
function toggleOtherProfession() {
  const prof = document.getElementById('faProfession').value;
  document.getElementById('otherProfessionField').style.display = (prof === 'أخرى') ? 'block' : 'none';
}
function sendFreeAdWhatsApp() {
  const name = document.getElementById('faName').value;
  const phone = document.getElementById('faPhone').value;
  const address = document.getElementById('faAddress').value;
  let prof = document.getElementById('faProfession').value;
  if (prof === 'أخرى') prof = document.getElementById('faOtherProfession').value;

  if (!name || !phone || !address || !prof) {
    window.uiToast('يرجى ملء جميع الخانات', 'error');
    return;
  }

  const text = `مرحباً، أود إضافة مهنة/خدمة:
الاسم: ${name}
رقم الهاتف: ${phone}
العنوان: ${address}
المهنة: ${prof}`;
  
  window.open('https://wa.me/963983127483?text=' + encodeURIComponent(text), '_blank');
  closeFreeAdModal();
}

/* ===== فورم «عندك شي تبيعه» → واتساب (بلا صور/تفاوض/مزاد/إعلان مجاني) ===== */
const SELL_CAR_BRANDS = ['تويوتا','هيونداي','كيا','نيسان','شيفروليه','سوزوكي','فورد','مرسيدس','بي إم دبليو','هوندا','مازدا','ميتسوبيشي','فولكس واغن','بيجو','رينو','سكودا','أوبل','فيات','MG','شيري','جيلي','BYD'];
const SELL_CAR_CLASSES = ['سيدان','هاتشباك','SUV','بيك أب','فان','كوبيه','كروس أوفر'];
const SELL_LAND_TYPES = ['أرض زراعية','أرض سكنية','أرض تجارية','أرض صناعية','أرض عقارية'];
// شروط النشر لكل فئة (مختصرة دون حذف أي شرط) — تظهر بعد اختيار الفئة
const SELL_TERMS = {
  'apt-sale': [
    '<b>الأهلية والبيانات:</b> أنا بالغ السنّ القانوني، وبياناتي (الاسم، الهاتف المفعّل، البريد) صحيحة وأتحمّل مسؤوليتها.',
    '<b>صحّة الإعلان:</b> تفاصيل الشقة دقيقة وواقعية (المساحة الصافية، الغرف، الطابق، عمر البناء، الكسوة، الإطلالة) مع صور حقيقية حديثة من أرض الواقع.',
    '<b>الوضع القانوني:</b> الشقة معروضة قانونياً وخالية من نزاعات أو رهونات أو مخالفات، وأنا مالكها أو مفوّض رسمياً ببيعها.',
    '<b>السعر والتحديث:</b> أحدّد السعر بوضوح (نهائي/قابل للتفاوض) وطريقة الدفع، وألتزم بحذف الإعلان أو الإشارة إلى «بِيعت» فور إتمام البيع.',
    '<b>إخلاء مسؤولية المنصّة:</b> «تم» وسيط تسويقي فقط وليست طرفاً في البيع، ولا تتحمّل مسؤولية السلامة الإنشائية أو مطابقة المساحة للطابو أو العيوب الخفية.',
    '<b>المعاينة والتحقّق:</b> أفهم نصيحة المنصّة بالمعاينة الميدانية والتحقّق من الأوراق الرسمية (قيد عقاري حديث، رخصة البناء) قبل دفع أي مبالغ.',
    '<b>العمولات والخصوصية:</b> النشر حسب الباقات والمنصّة لا تأخذ نسبة من البيع إلا باتفاق مكتوب مسبق، وتحمي بياناتي ولا تبيعها ولا تُفصح عنها إلا للجهات القضائية المختصّة.',
    '<b>تعديل الشروط:</b> قد تُعدَّل هذه الشروط وتسري فور نشرها.'
  ],
  'apt-rent': [
    '<b>الأهلية والبيانات:</b> أنا بالغ السنّ القانوني، وبياناتي صحيحة ومحدّثة (الاسم، الهاتف المفعّل، البريد) وأتحمّل مسؤولية نشاط حسابي.',
    '<b>صحّة الإعلان:</b> تفاصيل الشقة دقيقة (الموقع، الطابق، الغرف، نوع الفرش والأجهزة، توفّر الماء/الكهرباء/الإنترنت) مع صور حديثة وواقعية.',
    '<b>الأجرة والماليات:</b> أحدّد قيمة الإيجار بوضوح وطريقة الدفع (شهري/ربع سنوي/سنوي) ومبلغ التأمين المسترد إن وُجد وأي رسوم إضافية.',
    '<b>قانونية الإيجار والتحديث:</b> أملك الحقّ القانوني للتأجير (مالك أو مستأجر يحقّ له التأجير من الباطن بعقد رسمي)، والشقة غير خاضعة لنزاع، وألتزم بحذف الإعلان فور تأجيرها.',
    '<b>إخلاء مسؤولية المنصّة:</b> «تم» وسيط فقط وليست طرفاً في عقد الإيجار، ولا تتحمّل ما ينشأ بعد التوقيع (تخلّف عن السداد، أضرار أو سوء استخدام، عيوب صيانة خفية).',
    '<b>المعاينة والتوثيق:</b> أفهم نصيحة المنصّة بمعاينة الشقة والتحقّق من الأجهزة والخدمات قبل التوقيع، وتوثيق عقد الإيجار رسمياً.',
    '<b>العمولات والخصوصية:</b> النشر حسب الباقات والمنصّة لا تأخذ نسبة إلا باتفاق مكتوب، وتحمي بياناتي ولا تُفصح عنها إلا بطلب رسمي من الجهات المختصّة.',
    '<b>تعديل الشروط:</b> قد تُعدَّل وتسري فور نشرها.'
  ],
  'car-sale': [
    '<b>الأهلية والبيانات:</b> أنا بالغ السنّ القانوني لإتمام البيع ونقل الملكية، وبياناتي (الاسم، الهاتف المفعّل، البريد) صحيحة وأتحمّل مسؤولية معاملات حسابي.',
    '<b>صحّة الإعلان والصور:</b> تفاصيل دقيقة وواقعية (النوع، الموديل، سنة الصنع، العدّاد/الممشى، حالة الهيكل، الفئة، المحرك وناقل الحركة، الفحص الدوري والتأمين) مع صور حديثة حقيقية من الداخل والخارج دون تعديل يُخفي العيوب.',
    '<b>الملكية والوضع القانوني:</b> أنا المالك القانوني أو مفوّض رسمياً ببيعها، وهي خالية من قيود أو رهونات أو مخالفات تمنع نقل الملكية.',
    '<b>تحديث الإعلان:</b> ألتزم بحذف الإعلان أو الإشارة إلى «بِيعت» فور إتمام البيع.',
    '<b>إخلاء مسؤولية المنصّة:</b> «تم» وسيط إعلاني فقط وليست طرفاً في البيع، ولا تتحمّل مسؤولية الحالة الميكانيكية/الكهربائية أو العيوب الخفية أو التلاعب بالعدّاد أو الحوادث/الغرق السابقة غير المعلنة.',
    '<b>الفحص قبل الدفع:</b> أفهم نصيحة المنصّة القاطعة بإجراء فحص فنّي شامل في مركز معتمد والتحقّق من سجلّ الحوادث قبل دفع أي عربون.',
    '<b>العمولات والخصوصية:</b> النشر حسب الباقات والمنصّة لا تأخذ نسبة من البيع إلا باتفاق مكتوب، وتحمي بياناتي ولا تُفصح عنها إلا للجهات الأمنية/القضائية المختصّة.',
    '<b>تعديل الشروط:</b> قد تُعدَّل وتسري فور نشرها.'
  ],
  'car-rent': [
    '<b>الأهلية والوثائق:</b> أنا بالغ السنّ القانوني للقيادة والتأجير، وأملك رخصة قيادة سارية وهوية/جواز ساري وأقدّمها عند المعاملة، وبياناتي صحيحة وأتحمّل مسؤولية أي استخدام غير مصرّح لحسابي.',
    '<b>صحّة إعلان المؤجِّر:</b> تفاصيل دقيقة (النوع، الموديل، سنة الصنع، ناقل الحركة، الفحص الفنّي، التأمين) مع صور حقيقية حديثة من الداخل والخارج.',
    '<b>قانونية المركبة:</b> السيارة مرخّصة ومؤمّنة وتابعة لجهة مصرّح لها بالتأجير، وخالية من أعطال تؤثّر على سلامة الركاب.',
    '<b>الشفافية المادية:</b> تحديد قيمة الإيجار (يومي/أسبوعي/شهري) وسياسة الكيلومترات المحدّدة ومبلغ التأمين المسترد وتكلفة الكيلومترات الإضافية إن وُجدت.',
    '<b>إخلاء مسؤولية المنصّة:</b> «تم» وسيط فقط وليست طرفاً في عقد التأجير ولا تملك السيارات، ولا تتحمّل الأعطال أثناء التأجير أو الحوادث أو الأضرار الجسدية أو التلفيات.',
    '<b>المخالفات والسرقة:</b> المستأجر والمؤجّر يتحمّلان تسوية المخالفات المرورية أثناء فترة الإيجار وحالات السرقة أو الحجز القانوني وفق العقد بينهما والقوانين.',
    '<b>العمولات والخصوصية:</b> النشر حسب الباقات والمنصّة لا تأخذ نسبة إلا باتفاق مكتوب، وتحمي بياناتي ولا تُفصح عنها إلا للجهات الأمنية/القضائية المختصّة.',
    '<b>تعديل الشروط:</b> قد تُعدَّل وتسري فور نشرها.'
  ]
};
/* ===== إضافة الإعلانات: للمسجّلين فقط (الزوّار يُطلب منهم تسجيل الدخول) ===== */
function requireLogin(){
  if(window.isLoggedIn && window.isLoggedIn()) return true;
  (window.uiToast||function(){})('يلزم تسجيل الدخول لإضافة إعلان','info');
  if(window._acOpenAuth) window._acOpenAuth();
  return false;
}

/* ===== الموافقة على شروط النشر: مربّع ✓ إلزامي + لا يُفعَّل إلا بعد قراءة الشروط ===== */
var _termsRead = { sell:false, partner:false, freead:false };
function markTermsRead(form){
  _termsRead[form]=true;
  var map={ sell:['sellAgree','sellReadHint'], partner:['partnerAgree','partnerReadHint'], freead:['faAgree','faReadHint'] };
  var m=map[form]; if(!m) return;
  var cb=document.getElementById(m[0]); if(cb) cb.disabled=false;
  var h=document.getElementById(m[1]); if(h) h.style.display='none';
}
// نافذة الشروط — لا تُفعّل الموافقة إلا بعد التمرير حتى نهايتها (قراءة فعلية)
function openTermsModal(html, title, onRead){
  var m=document.getElementById('pubTermsOverlay');
  if(!m){
    m=document.createElement('div'); m.id='pubTermsOverlay'; m.className='pub-terms-ov';
    m.innerHTML='<div class="pub-terms-card"><div class="pub-terms-head"><h3 id="pubTermsTitle">شروط النشر وسياسة الخصوصية</h3><button class="pub-terms-x" onclick="closeTermsModal()" aria-label="إغلاق">✕</button></div><div class="pub-terms-body" id="pubTermsBody"></div><div class="pub-terms-foot"><button class="sell-btn ghost" onclick="closeTermsModal()">إغلاق</button></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click',function(e){ if(e.target===m) closeTermsModal(); });
  }
  document.getElementById('pubTermsTitle').textContent=title||'شروط النشر وسياسة الخصوصية';
  var body=document.getElementById('pubTermsBody');
  body.innerHTML=html||''; body.scrollTop=0; body.onscroll=null;
  if(onRead){
    var fire=function(){ if(body.scrollTop+body.clientHeight >= body.scrollHeight-14){ body.onscroll=null; onRead(); } };
    body.onscroll=fire;
    setTimeout(function(){ if(body.scrollHeight <= body.clientHeight+14){ onRead(); } }, 90); // محتوى قصير = مقروء
  }
  m.classList.add('show');
}
function closeTermsModal(){ var m=document.getElementById('pubTermsOverlay'); if(m) m.classList.remove('show'); }
window.openTermsModal=openTermsModal; window.closeTermsModal=closeTermsModal;
function termsListHTML(title, terms){
  return '<div class="terms-modal-h">'+esc(title)+'</div><ul class="terms-modal-list">'+terms.map(function(t){ return '<li>'+t+'</li>'; }).join('')+'</ul>';
}
// شروط عامّة للفئات التي لا تملك شروطاً مفصّلة (محلات/أراضي/معدات...)
var GENERAL_SELL_TERMS=[
  'كل المعلومات والصور التي أقدّمها <b>صحيحة وحقيقية</b>، والإعلان ملكي أو أنا مفوّض رسمياً بعرضه.',
  'أتحمّل كامل المسؤولية القانونية عن إعلاني، ومنصّة «تم» <b>وسيط إعلاني فقط</b> لا تتحمّل أي نزاع أو ضرر بين الطرفين.',
  'لا أنشر محتوى مخالفاً للقانون أو الآداب العامة أو منتجات مجهولة المصدر.',
  'للإدارة الحقّ في مراجعة الإعلان أو تعديله أو رفضه أو حذفه، وقد تتغيّر الشروط وتسري فور نشرها.'
];
var _sellTermsModalHTML='';
function openSellTermsModal(){ openTermsModal(_sellTermsModalHTML, 'شروط النشر وسياسة الخصوصية', function(){ markTermsRead('sell'); }); }
window.openSellTermsModal=openSellTermsModal;

function renderSellTerms(){
  var sel=document.getElementById('sellCat'); var box=document.getElementById('sellTerms'); if(!sel||!box) return;
  var cat=sel.value, terms=SELL_TERMS[cat]||[];
  var label=getCat(cat)?getCat(cat).label:'';
  _sellTermsModalHTML = terms.length ? termsListHTML('شروط نشر إعلان «'+label+'»', terms) : termsListHTML('شروط النشر العامّة', GENERAL_SELL_TERMS);
  _termsRead.sell=false;   // إعادة الضبط عند تغيير الفئة — يجب قراءة شروط الفئة الجديدة
  box.innerHTML='<div class="terms-agree-one"><label class="fa-term"><input type="checkbox" id="sellAgree" class="sell-term-chk" disabled onchange="sellTermsCheck()"><span>أوافق على <a class="terms-link" onclick="event.preventDefault();event.stopPropagation();openSellTermsModal()">شروط النشر وسياسة الخصوصية</a> لطلبك تم</span></label><div class="terms-readhint" id="sellReadHint">اضغط «شروط النشر» واقرأها حتى النهاية لتتمكّن من الموافقة</div></div>';
  sellTermsCheck();
}
function sellTermsCheck(){
  var all=document.querySelectorAll('.sell-term-chk'), done=document.querySelectorAll('.sell-term-chk:checked');
  var ok=(all.length===0)||(done.length===all.length);
  var agree=document.getElementById('sellAgree');
  // عند وضع ✓: يختفي مربّع الموافقة ويظهر الفورم
  var box=document.getElementById('sellTerms'); if(box) box.style.display = (ok && agree) ? 'none' : '';
  var fields=document.getElementById('sellFields'); if(fields) fields.style.display = ok ? 'block' : 'none';
  var btn=document.getElementById('sellSubmitBtn');
  if(btn){ btn.disabled=!ok; btn.style.opacity=ok?'1':'.5'; btn.style.pointerEvents=ok?'auto':'none'; btn.style.display = ok ? '' : 'none'; }
}
window.renderSellTerms=renderSellTerms; window.sellTermsCheck=sellTermsCheck;

function openSellModal(){
  if(!requireLogin()) return;
  document.getElementById('sellCat').innerHTML = CATS.filter(c=>c.type!=='freead'&&c.type!=='partner').map(c=>`<option value="${c.id}">${c.label}</option>`).join('');
  document.getElementById('sellCity').innerHTML = CITIES.map(c=>`<option value="${c}">${c}</option>`).join('');
  sellCityChange();
  renderSellFields();
  document.getElementById('sellModalOverlay').classList.add('show');
  document.body.style.overflow='hidden';
}
function closeSellModal(){
  document.getElementById('sellModalOverlay').classList.remove('show');
  document.body.style.overflow='';
}
function sellCityChange(){
  const city = document.getElementById('sellCity').value;
  document.getElementById('sellCityOtherWrap').style.display = city==='أخرى' ? 'block':'none';
  const list = NEIGHBORHOODS[city] || NEIGHBORHOODS['جبلة'] || [];
  document.getElementById('sellHood').innerHTML = '<option value="">-- اختياري --</option>' + list.map(n=>`<option value="${n}">${n}</option>`).join('') + '<option value="أخرى">أخرى</option>';
}
function _sf(id,label,attrs){ return `<div class="sell-field"><label>${label}</label><input id="${id}" ${attrs||''}></div>`; }
function _ssel(id,label,opts){ return `<div class="sell-field"><label>${label}</label><select id="${id}">${opts.map(o=>`<option>${o}</option>`).join('')}</select></div>`; }
function renderSellFields(){
  const c = getCat(document.getElementById('sellCat').value), t = c?c.type:'';
  let h='';
  if(t==='apartment'){
    h = _sf('sellRooms','غرف النوم','type="number" min="0" value="1"')
      + _sf('sellBaths','الحمامات','type="number" min="0" value="1"')
      + _sf('sellArea','المساحة م²','type="number" min="0"')
      + _sf('sellKitchens','المطابخ','type="number" min="0" value="1"')
      + _sf('sellBalconies','الشرفات','type="number" min="0" value="0"')
      + _sf('sellLiving','غرف المعيشة','type="number" min="0" value="1"')
      + _sf('sellStorage','المستودعات','type="number" min="0" value="0"');
  } else if(t==='car'){
    h = _ssel('sellCarBrand','الماركة',SELL_CAR_BRANDS)
      + _sf('sellCarModel','الموديل','type="text" placeholder="مثال: كامري"')
      + _sf('sellCarYear','سنة الصنع','type="number" min="1990" max="2026" value="2020"')
      + _sf('sellCarKm','المسافة (كم)','type="number" min="0"')
      + _sf('sellCarColor','اللون','type="text" placeholder="أبيض"')
      + _ssel('sellCarClass','الفئة',SELL_CAR_CLASSES);
  } else if(t==='shop'){
    h = _sf('sellShopArea','المساحة م²','type="number" min="0"')
      + _sf('sellShopFloor','الطابق','type="text" placeholder="أرضي / أول"')
      + _sf('sellShopFronts','عدد الواجهات','type="number" min="0"')
      + _sf('sellShopUse','يصلح لـ (اختياري)','type="text" placeholder="مطعم، مكتب..."');
  } else if(t==='farm'){
    h = _ssel('sellFarmType','نوع الأرض',SELL_LAND_TYPES)
      + _sf('sellFarmArea','المساحة م²','type="number" min="0"')
      + _sf('sellFarmServices','الخدمات والمرافق','type="text" placeholder="كهرباء، ماء، طريق..."')
      + _sf('sellFarmNum','عدد الأشجار / الطوابق (اختياري)','type="number" min="0"');
  }
  document.getElementById('sellCatFields').innerHTML = h;
  renderSellTerms();
}
function _sv(id){ const e=document.getElementById(id); return e?String(e.value).trim():''; }
function submitSell(){
  const c = getCat(document.getElementById('sellCat').value);
  const title=_sv('sellTitle'), price=_sv('sellPrice'), name=_sv('sellName'), phone=_sv('sellPhone');
  let city=_sv('sellCity'); if(city==='أخرى') city=_sv('sellCityOther');
  const hood=_sv('sellHood');
  if(!title||!city||!price||!name||!phone){ (window.uiToast||window.alert)('يرجى ملء الخانات الأساسية: العنوان، المدينة، السعر، الاسم، الهاتف','error'); return; }
  var _allT=document.querySelectorAll('.sell-term-chk'), _okT=document.querySelectorAll('.sell-term-chk:checked');
  if(_allT.length && _okT.length!==_allT.length){ (window.uiToast||window.alert)('يرجى قراءة الشروط والموافقة عليها لإكمال الإرسال','error'); return; }
  const lines=['📋 إعلان جديد عبر طلبك تم', 'الفئة: '+c.label, 'العنوان: '+title, 'المدينة: '+city];
  if(hood) lines.push('الحي: '+hood);
  lines.push('السعر: '+price+' ل.س');
  const t=c.type, add=(lbl,id)=>{ const x=_sv(id); if(x) lines.push(lbl+': '+x); };
  if(t==='apartment'){ add('غرف النوم','sellRooms'); add('الحمامات','sellBaths'); add('المساحة م²','sellArea'); add('المطابخ','sellKitchens'); add('الشرفات','sellBalconies'); add('غرف المعيشة','sellLiving'); add('المستودعات','sellStorage'); }
  else if(t==='car'){ add('الماركة','sellCarBrand'); add('الموديل','sellCarModel'); add('سنة الصنع','sellCarYear'); add('المسافة كم','sellCarKm'); add('اللون','sellCarColor'); add('الفئة','sellCarClass'); }
  else if(t==='shop'){ add('المساحة م²','sellShopArea'); add('الطابق','sellShopFloor'); add('عدد الواجهات','sellShopFronts'); add('يصلح لـ','sellShopUse'); }
  else if(t==='farm'){ add('نوع الأرض','sellFarmType'); add('المساحة م²','sellFarmArea'); add('الخدمات','sellFarmServices'); add('عدد الأشجار/الطوابق','sellFarmNum'); }
  const desc=_sv('sellDesc'); if(desc) lines.push('الوصف: '+desc);
  lines.push('—','الاسم: '+name,'واتساب: '+phone);
  window.open('https://wa.me/963983127483?text='+encodeURIComponent(lines.join('\n')),'_blank');
  closeSellModal();
}
window.openSellModal=openSellModal; window.closeSellModal=closeSellModal;
window.renderSellFields=renderSellFields; window.sellCityChange=sellCityChange; window.submitSell=submitSell;

/* ===== فورم «ابحث عن شريك» → واتساب ===== */
var PARTNER_TERMS=[
  'أنا <b>جادّ</b> في طرح الشراكة، وكل المعلومات والصور التي أقدّمها <b>صحيحة وحقيقية</b>.',
  'أفهم أن منصّة «تم» <b>وسيط إعلاني فقط</b>، لا تضمن الشراكة ولا تتحمّل أي اتفاق أو خلاف أو ضرر مالي بين الطرفين.',
  'أتحمّل مسؤولية <b>التفاوض والتحقّق من الشريك</b> وتوثيق الاتفاقات قانونياً قبل أي التزام مالي.',
  'للإدارة الحقّ في مراجعة الطلب أو تعديله أو رفضه أو حذفه، وقد تتغيّر الشروط وتسري فور نشرها.'
];
function openPartnerTermsModal(){ openTermsModal(termsListHTML('شروط «ابحث عن شريك»', PARTNER_TERMS), 'شروط النشر وسياسة الخصوصية', function(){ markTermsRead('partner'); }); }
window.openPartnerTermsModal=openPartnerTermsModal;
function renderPartnerTerms(){
  var box=document.getElementById('partnerTerms'); if(!box) return;
  _termsRead.partner=false;   // يجب قراءة الشروط قبل تفعيل الموافقة
  box.innerHTML='<p style="font-size:13px;color:#475569;margin:0 0 10px">قسم مجاني لربط أصحاب الأفكار والأصول ورؤوس الأموال بالشركاء.</p>'
    +'<div class="terms-agree-one"><label class="fa-term"><input type="checkbox" id="partnerAgree" class="partner-term-chk" disabled onchange="partnerTermsCheck()"><span>أوافق على <a class="terms-link" onclick="event.preventDefault();event.stopPropagation();openPartnerTermsModal()">شروط النشر وسياسة الخصوصية</a> لطلبك تم</span></label><div class="terms-readhint" id="partnerReadHint">اضغط «شروط النشر» واقرأها حتى النهاية لتتمكّن من الموافقة</div></div>';
}
function openPartnerModal(){
  if(!requireLogin()) return;
  renderPartnerTerms();
  partnerTermsCheck();
  pOfferChange();
  document.getElementById('partnerModalOverlay').classList.add('show');
  document.body.style.overflow='hidden';
}
// الموقع يظهر فقط عند «عندي أرض أو عقار»
function pOfferChange(){
  var off=(document.getElementById('pOffer')||{}).value||'';
  var w=document.getElementById('pLocWrap'); if(w) w.style.display=(off==='عندي أرض أو عقار')?'':'none';
}
window.pOfferChange=pOfferChange;
function closePartnerModal(){
  document.getElementById('partnerModalOverlay').classList.remove('show');
  document.body.style.overflow='';
}
function partnerTermsCheck(){
  var agree=document.getElementById('partnerAgree');
  var ok = !!(agree && agree.checked);
  // عند وضع ✓: يختفي مربّع الموافقة ويظهر الفورم
  var t=document.getElementById('partnerTerms'); if(t) t.style.display = (ok && agree) ? 'none' : 'block';
  var f=document.getElementById('partnerFields'); if(f) f.style.display=ok?'block':'none';
  var b=document.getElementById('partnerSubmitBtn'); if(b){ b.disabled=!ok; b.style.opacity=ok?'1':'.5'; b.style.pointerEvents=ok?'auto':'none'; b.style.display=ok?'':'none'; }
}
function submitPartner(){
  var offer=_sv('pOffer'), sector=_sv('pSector'), title=_sv('pTitle'), desc=_sv('pDesc'),
      seek=_sv('pSeek'), type=_sv('pType'), capital=_sv('pCapital'), loc=_sv('pLoc'), name=_sv('pName'), phone=_sv('pPhone');
  var needLoc = offer==='عندي أرض أو عقار';
  if(!title||!desc||!name||!phone||(needLoc&&!loc)){ (window.uiToast||window.alert)('يرجى ملء الخانات الأساسية (العنوان، الوصف، الاسم، الهاتف'+(needLoc?'، الموقع':'')+')','error'); return; }
  var lines=['🤝 طلب شراكة جديد عبر طلبك تم','ما يقدّمه: '+offer,'المجال: '+sector,'العنوان: '+title,'الوصف: '+desc,'يبحث عن: '+seek,'نوع الشراكة: '+type];
  if(capital) lines.push('رأس المال التقريبي: '+capital+' ل.س');
  if(loc) lines.push('الموقع: '+loc);
  lines.push('—','الاسم: '+name,'واتساب: '+phone);
  window.open('https://wa.me/963983127483?text='+encodeURIComponent(lines.join('\n')),'_blank');
  closePartnerModal();
}
window.openPartnerModal=openPartnerModal; window.closePartnerModal=closePartnerModal;
window.partnerTermsCheck=partnerTermsCheck; window.submitPartner=submitPartner;

// Init
// history.state يحفظه المتصفّح عبر الريفريش = آخر مكان كنتَ فيه (الأدقّ)؛ نعتمده أولاً ثم tam_state كاحتياط
const _histState = (history.state && history.state.page) ? history.state : null;
const _savedState = _histState || JSON.parse(sessionStorage.getItem('tam_state') || 'null');
const _isRefresh = !!_savedState;
// عند تحديث صفحة الإعلان: احفظ معرّفه من حالة المتصفّح (تبقى عبر الريفريش) قبل أن نستبدلها
const _refreshDetailId = (history.state && history.state.page === 'detail' && history.state.detailId != null) ? history.state.detailId : null;
// احفظ المكان الحالي + موضع التمرير قبل أي إغلاق/تحديث
function _saveStateNow(){
  try{
    var base = (history.state && history.state.page) ? history.state : JSON.parse(sessionStorage.getItem('tam_state') || 'null');
    if(!base) return;
    var s = Object.assign({}, base);
    s.scrollPos = window.pageYOffset || document.documentElement.scrollTop || 0;
    sessionStorage.setItem('tam_state', JSON.stringify(s));
  }catch(e){}
}
window.addEventListener('pagehide', _saveStateNow);
document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') _saveStateNow(); });
// حفظ موضع التمرير أثناء التصفّح (مخفّف) — يضمن استعادته حتى لو لم يُطلق pagehide (سحب-للتحديث على الموبايل)
var _scrollSaveT;
window.addEventListener('scroll', function(){ clearTimeout(_scrollSaveT); _scrollSaveT = setTimeout(_saveStateNow, 250); }, {passive:true});

// Show blur on every load
// No loading effect

history.replaceState(_savedState || {page:'home',sC:null,sType:null,sFeatured:false,sQ:'',detailId:null,currentPage:1,scrollPos:0},'',null);

function restoreState() {
  // ابدأ الـ stack بصفحة الرئيسية كـ base
  if(_navStack.length===0) _navStack.push({page:'home',sC:null,sType:null,sFeatured:false,sQ:'',currentPage:1,scrollPos:0});

  var _urlParams = new URLSearchParams(window.location.search);
  var _sharedId = _urlParams.get('id');
  if (_sharedId) {
    history.replaceState({page:'detail',detailId:_sharedId,sC:null,sType:null,sFeatured:false,sQ:'',currentPage:1},'',window.location.pathname);
    window._pendingShareId = _sharedId;
    return;
  }
  // عند تحديث الصفحة وأنت داخل إعلان: ابقَ على الإعلان نفسه (من history.state أو من المحفوظ)
  var _detailToRestore = (_refreshDetailId != null) ? _refreshDetailId
    : (_savedState && _savedState.page === 'detail' && _savedState.detailId != null ? _savedState.detailId : null);
  if (_detailToRestore != null) {
    window._pendingShareId = _detailToRestore;
    return;
  }
  if (_savedState) {
    sC = _savedState.sC;
    sType = _savedState.sType;
    sFeatured = _savedState.sFeatured;
    sQ = _savedState.sQ || '';
    sDiscount = !!_savedState.sDiscount;
    if (_savedState.currentPage) _currentPage = _savedState.currentPage;

    if (_savedState.page === 'detail') {
      _skipPush = true;
      if (sDiscount || _savedState.sType || _savedState.sC) {
        _activeTab = sDiscount ? 'discounts' : typeToTab(sType); nav('listings', null, true);
      } else {
        renderHome();
      }
    } else if (_savedState.page === 'listings') {
      _skipPush = true;
      _activeTab = sDiscount ? 'discounts' : typeToTab(sType); nav('listings', null, true);
    } else if (_savedState.page === 'about') {
      _skipPush = true;
      nav('about');
    } else if (_savedState.page === 'contact') {
      _skipPush = true;
      nav('contact');
    } else {
      renderHome();
    }
  } else {
    renderHome();
  }
  // استعد موضع التمرير داخل القسم (محاولات متكرّرة لتعويض تحميل الصور/تغيّر الارتفاع)
  var _sp = (_savedState && _savedState.scrollPos) ? _savedState.scrollPos : 0;
  if (_sp > 0) { [50, 200, 450, 800].forEach(function (d) { setTimeout(function () { window.scrollTo(0, _sp); }, d); }); }
  // Reset state to current page (not detail) — مع الحفاظ على موضع التمرير
  const cleanState = {page: _savedState?.page === 'detail' ? (_savedState.sType ? 'listings' : 'home') : (_savedState?.page || 'home'), sC, sType, sFeatured, sQ, sDiscount, detailId: null, currentPage: _currentPage, scrollPos: _sp};
  history.replaceState(cleanState, '', null);
  sessionStorage.setItem('tam_state', JSON.stringify(cleanState));
}

// ===== سعر صرف الدولار (يحدّثه الأدمن، يُطبَّق داخل كل إعلان) =====
async function loadUsdRate(){
  try {
    const { data } = await supabaseClient.from('settings').select('data').eq('key','usd_rate').maybeSingle();
    const r = data && data.data && Number(data.data.rate);
    if (r && r > 0) {
      _usdRate = r;
      // لو كان إعلان مفتوحاً وقت وصول السعر (ريفريش على صفحة إعلان)، أعد عرضه ليظهر الدولار
      const dp = document.getElementById('page-detail');
      if (dp && dp.classList.contains('act') && window._currentListing) {
        _skipPush = true; try { viewDetail(window._currentListing.id); } catch(e){} _skipPush = false;
      }
    }
  } catch(e){}
}
function usdFmt(usd){
  if(usd>=100) return Math.round(usd).toLocaleString('en-US');
  if(usd>=1)   return (Math.round(usd*10)/10).toLocaleString('en-US');
  return (Math.round(usd*100)/100).toLocaleString('en-US');   // أقل من دولار: منزلتان
}
function usdHTML(syp){
  const n = Number(syp);
  if(!_usdRate || !n || n<=0) return '';
  const usd = n/_usdRate;
  if(!(usd>0)) return '';
  return '<div class="det-usd">'+usdFmt(usd)+' دولار</div>';
}
window.loadUsdRate = loadUsdRate;
if (USE_FIREBASE) { loadUsdRate(); }

if (USE_FIREBASE) {
  // قراءة واحدة عند فتح الصفحة من Supabase
  supabaseClient.from('ads').select('*').eq('status', 'active')
    .order('created_at', { ascending: false })
    .then(({ data, error }) => {
      if (error) { console.error('Supabase load error:', error); restoreState(); hideSplash(); return; }
      listings = (data || []).map(mapRow).filter(function(l){ return !isAuctionEnded(l); });
      restoreState();
      if (window._pendingShareId) {
        var _ad = listings.find(function(x){ return String(x.id)===String(window._pendingShareId); });
        if (_ad) viewDetail(window._pendingShareId); else renderHome();
        window._pendingShareId = null;
      }
      hideSplash();
      loadAuctionBidSummaries();   // عدد المزايدين والمزايدة الحالية لبطاقات المزاد
    });
} else {
  restoreState();
  hideSplash();
}

// تحديث لحظي: عند أي تغيير في الإعلانات يُعاد التحميل وتُحدَّث الصفحة فوراً
// (Supabase لا يحاسب على القراءات، فالتحديث اللحظي مُفعَّل للسرعة)
if (USE_FIREBASE) {
  supabaseClient.channel('public-ads')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ads' }, function () {
      supabaseClient.from('ads').select('*').eq('status', 'active').order('created_at', { ascending: false })
        .then(function (res) {
          listings = (res.data || []).map(mapRow).filter(function(l){ return !isAuctionEnded(l); });
          var active = document.querySelector('.page.act');
          var id = active ? active.id : '';
          if (id === 'page-home') renderHome();
          else if (id === 'page-listings') renderListings(true);
        });
    }).subscribe();
}

let _splashHidden=false;
function hideSplash(){
  if(_splashHidden) return; _splashHidden=true;
  try{updateFavCount();}catch(e){}
  var isReload=false;try{isReload=performance.getEntriesByType('navigation')[0].type==='reload';}catch(e){}
  // عند الريفريش: أبقِ الشاشة البيضاء ثانية واحدة على الأقل لإخفاء أي ومضة
  var minMs=isReload?1000:0;
  var elapsed=Date.now()-(window._splashShownAt||Date.now());
  var wait=Math.max(0,minMs-elapsed);
  setTimeout(function(){
    var hf=document.getElementById('hideFlash');if(hf)hf.remove();
    var rs=document.getElementById('refreshSplash');
    if(rs){rs.firstChild.style.opacity='0';setTimeout(function(){rs.remove();},isReload?450:600);}
    setTimeout(showInstallBanner,2000);
  },wait);
}
// Fallback: if splash still showing after 5 seconds, force hide and show page
setTimeout(function(){
  hideSplash();
  if(!listings.length){restoreState();}
},5000);

// ===== LIGHTBOX =====
let _lbImgs=[], _lbIdx=0;
function openLightbox(idx){
  const l=window._currentListing;if(!l||!l.images||!l.images.length)return;
  _lbImgs=l.images;_lbIdx=idx||0;
  const lb=document.getElementById('lightbox');
  lb.querySelector('.lb-img').src=_lbImgs[_lbIdx];
  lb.querySelector('.lb-counter').textContent=(_lbIdx+1)+' / '+_lbImgs.length;
  lb.style.display='flex';
  document.body.style.overflow='hidden';
  if(_lbImgs.length<=1){
    lb.querySelector('.lb-prev').style.display='none';
    lb.querySelector('.lb-next').style.display='none';
  }else{
    lb.querySelector('.lb-prev').style.display='flex';
    lb.querySelector('.lb-next').style.display='flex';
  }
  _lbRenderThumbs();
}
function _lbRenderThumbs(){
  var box=document.getElementById('lbThumbs'); if(!box) return;
  if(_lbImgs.length<=1){ box.style.display='none'; box.innerHTML=''; return; }
  box.style.display='flex';
  box.innerHTML=_lbImgs.map(function(s,i){ return '<img src="'+s+'" loading="lazy" class="'+(i===_lbIdx?'act':'')+'" onclick="lbGo('+i+')">'; }).join('');
  var act=box.querySelector('img.act'); if(act&&act.scrollIntoView){ try{ act.scrollIntoView({inline:'center',block:'nearest'}); }catch(e){} }
}
function lbGo(i){
  _lbIdx=((i%_lbImgs.length)+_lbImgs.length)%_lbImgs.length;
  const lb=document.getElementById('lightbox');
  lb.querySelector('.lb-img').src=_lbImgs[_lbIdx];
  lb.querySelector('.lb-counter').textContent=(_lbIdx+1)+' / '+_lbImgs.length;
  _lbRenderThumbs();
}
function closeLightbox(){
  document.getElementById('lightbox').style.display='none';
  document.body.style.overflow='';
}
function lbNav(dir){
  _lbIdx=((_lbIdx+dir)%_lbImgs.length+_lbImgs.length)%_lbImgs.length;
  const lb=document.getElementById('lightbox');
  lb.querySelector('.lb-img').src=_lbImgs[_lbIdx];
  lb.querySelector('.lb-counter').textContent=(_lbIdx+1)+' / '+_lbImgs.length;
  _lbRenderThumbs();
}
// Swipe support for lightbox
(function(){
  var lb,sx=0;
  document.addEventListener('DOMContentLoaded',function(){
    lb=document.getElementById('lightbox');if(!lb)return;
    lb.addEventListener('touchstart',function(e){sx=e.touches[0].clientX;},{passive:true});
    lb.addEventListener('touchend',function(e){
      var diff=sx-e.changedTouches[0].clientX;
      if(Math.abs(diff)>50){diff>0?lbNav(1):lbNav(-1);}
    },{passive:true});
  });
})();
// Keyboard support
document.addEventListener('keydown',function(e){
  var lb=document.getElementById('lightbox');
  if(!lb||lb.style.display==='none')return;
  if(e.key==='Escape')closeLightbox();
  if(e.key==='ArrowLeft')lbNav(1);
  if(e.key==='ArrowRight')lbNav(-1);
});

/* ===== قفل تمرير الخلفية عند فتح أي نافذة/أوفرلاي ===== */
(function(){
  // أي عنصر أوفرلاي/نافذة (نطابق بالاسم ثم نتأكّد أنه ظاهر فعلاً على الشاشة)
  var SEL = '[class*="overlay"],[class*="Overlay"],[id*="Overlay"],.pub-terms-ov,.u-ov,.ac-chat,.ac-terms-ov,.ac-spin-ov,.filter-sheet,#lightbox';
  function shown(el){
    if(!el) return false;
    var cs=getComputedStyle(el);
    if(cs.display==='none'||cs.visibility==='hidden'||parseFloat(cs.opacity||'1')===0) return false;
    if(cs.pointerEvents==='none' && parseFloat(cs.opacity||'1')<0.05) return false;
    var r=el.getBoundingClientRect();
    if(r.width<=1||r.height<=1) return false;
    // متقاطع مع الشاشة فعلاً (يستبعد المنزلق خارجها بالـ transform)
    return r.bottom>4 && r.top<innerHeight-4 && r.right>4 && r.left<innerWidth-4;
  }
  function anyOpen(){
    var els=document.querySelectorAll(SEL);
    for(var i=0;i<els.length;i++){ if(shown(els[i])) return true; }
    return false;
  }
  var _raf=null;
  function evaluate(){ _raf=null; document.documentElement.classList.toggle('scroll-lock', anyOpen()); }
  function schedule(){ if(_raf) return; _raf=requestAnimationFrame(evaluate); }
  function relevant(muts){
    for(var i=0;i<muts.length;i++){
      var m=muts[i], t=m.target;
      if(t && t.nodeType===1 && t.matches && t.matches(SEL)) return true;   // تغيّر صنف/ستايل أوفرلاي
      var an=m.addedNodes||[];
      for(var j=0;j<an.length;j++){ var n=an[j];
        if(n.nodeType===1 && ((n.matches&&n.matches(SEL))||(n.querySelector&&n.querySelector(SEL)))) return true; // أوفرلاي جديد
      }
    }
    return false;
  }
  function start(){
    var mo=new MutationObserver(function(muts){ if(relevant(muts)) schedule(); });
    mo.observe(document.body,{attributes:true,attributeFilter:['class','style'],subtree:true,childList:true});
    schedule();
  }
  if(document.body) start(); else document.addEventListener('DOMContentLoaded',start);
})();

// ===== SERVICE WORKER =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // استخدام مسار نسبي لضمان العمل على GitHub Pages مع اسم المستودع
    // إضافة معامل v=2 لإجبار المتصفح على تحديث الـ Service Worker وتجاوز الكاش
    const swPath = '/sw.js?v=17';
    navigator.serviceWorker.register(swPath).then(() => {
      // استدعاء نافذة التثبيت بعد تسجيل الـ Service Worker بـ 3 ثوانٍ لضمان ظهورها
      setTimeout(showInstallBanner, 3000);
    }).catch(err => console.error('SW registration failed:', err));
  });
}

// ===== INSTALL BANNER =====
let _deferredPrompt = null;
let _appInstalled = localStorage.getItem('tam_installed') === '1';
let _bannerDismissed = sessionStorage.getItem('tam_banner_dismissed') === '1';

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _deferredPrompt = e;
});

window.addEventListener('appinstalled', () => {
  _appInstalled = true;
  localStorage.setItem('tam_installed', '1');
  const b = document.getElementById('installBanner');
  if (b) b.style.display = 'none';
});

function showInstallBanner() {
  if (_appInstalled || _bannerDismissed) return;
  // Check if running as installed app
  if (window.matchMedia('(display-mode: standalone)').matches) return;
  if (window.navigator.standalone) return;
  const b = document.getElementById('installBanner');
  if (b) b.style.display = 'block';
}

function installApp() {
  if (_deferredPrompt) {
    _deferredPrompt.prompt();
    _deferredPrompt.userChoice.then(r => {
      if (r.outcome === 'accepted') {
        _appInstalled = true;
        localStorage.setItem('tam_installed', '1');
      }
      _deferredPrompt = null;
      document.getElementById('installBanner').style.display = 'none';
    });
  } else {
    // iOS or browsers without beforeinstallprompt
    const b = document.getElementById('installBanner');
    b.querySelector('#installBtn').style.display = 'none';
    b.querySelector('div > div:last-child').innerHTML = '<div style="font-size:12px;color:#737373;line-height:1.6">اضغط على <strong>مشاركة</strong> ثم <strong>إضافة للشاشة الرئيسية</strong></div>';
  }
}

function dismissInstall() {
  _bannerDismissed = true;
  sessionStorage.setItem('tam_banner_dismissed', '1');
  document.getElementById('installBanner').style.display = 'none';
}
