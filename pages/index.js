import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Head from 'next/head';

// ── 로컬스토리지 헬퍼 ─────────────────────────────
const LS = {
  get: (k, d=null) => { try { const v=localStorage.getItem(k); return v?JSON.parse(v):d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) { console.error('LS.set 실패:', e); } },
};

// 이미지를 별도 키로 분리 저장 (5MB 한계 분산)
const ImageStore = {
  // 이미지를 최대 400px로 리사이즈 후 저장 (Promise 반환 - 완료 보장)
  set: (id, dataUrl) => new Promise((resolve) => {
    if (!dataUrl) return resolve(false);
    // http URL이면 그냥 저장
    if (!dataUrl.startsWith('data:')) {
      try { localStorage.setItem('img_'+id, dataUrl); resolve(true); } catch { resolve(false); }
      return;
    }
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const MAX = 400;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          const resized = canvas.toDataURL('image/jpeg', 0.75);
          localStorage.setItem('img_'+id, resized);
          resolve(true);
        } catch(e) { console.warn('이미지 저장 실패:', id, e); resolve(false); }
      };
      img.onerror = () => { console.warn('이미지 로드 실패:', id); resolve(false); };
      img.src = dataUrl;
    } catch(e) { console.warn('이미지 리사이즈 실패:', e); resolve(false); }
  }),
  get: (id) => { try { return localStorage.getItem('img_'+id) || null; } catch { return null; } },
  del: (id) => { try { localStorage.removeItem('img_'+id); } catch {} },
};

// ── 디자인 토큰 ───────────────────────────────────
const S = {
  bg: '#F7F6F2', surface: '#fff', border: '#E8E6E0',
  text: '#1A1A18', sub: '#888780', hint: '#B4B2A9', accent: '#2C2C2A',
  danger: '#E24B4A', radius: 16, radiusSm: 10,
};

// ── 상수 ──────────────────────────────────────────
const INDOOR_TEMPS = { '오피스':22, '카페':21, '백화점/쇼핑몰':20, '식당':21, '대중교통':22, '기타 실내':21 };
const CAT_EMOJI    = { '아우터':'🧥', '상의':'👕', '하의':'👖', '원피스':'👗', '신발':'👟', '액세서리':'👜' };
const TIME_OPTS    = ['06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00'];
const TIME_LABELS  = ['오전 6시','오전 7시','오전 8시','오전 9시','오전 10시','오전 11시','낮 12시','오후 1시','오후 2시','오후 3시','오후 4시','오후 5시','오후 6시','오후 7시','저녁 8시','밤 9시','밤 10시'];
const OUTDOOR_PLACES = ['실외 이동','야외 활동'];
const INDOOR_PLACES  = ['오피스','카페','백화점/쇼핑몰','식당','대중교통','기타 실내'];
const OCCASIONS      = ['캐주얼','비즈니스 캐주얼','포멀','야외활동','데이트'];
const CATEGORIES     = ['아우터','상의','하의','원피스','신발','액세서리'];

// ── 스타일 헬퍼 ───────────────────────────────────
const btn        = (x={}) => ({ display:'inline-flex', alignItems:'center', justifyContent:'center', padding:'9px 16px', borderRadius:S.radiusSm, fontSize:13, fontWeight:500, fontFamily:'inherit', cursor:'pointer', border:`1px solid ${S.border}`, background:S.surface, color:S.text, ...x });
const btnPrimary = (x={}) => btn({ background:S.accent, color:'#fff', border:`1px solid ${S.accent}`, ...x });
const btnDanger  = (x={}) => btn({ background:S.danger, color:'#fff', border:`1px solid ${S.danger}`, ...x });
const inputSt    = (x={}) => ({ width:'100%', border:`1px solid ${S.border}`, borderRadius:S.radiusSm, padding:'9px 12px', fontSize:13, fontFamily:'inherit', background:S.surface, color:S.text, outline:'none', boxSizing:'border-box', ...x });
const card    = { background:S.surface, border:`1px solid ${S.border}`, borderRadius:S.radius, padding:16, marginBottom:12 };
const formRow = { marginBottom:10 };
const labelSt = { fontSize:12, color:S.sub, marginBottom:4 };

// ── 커스텀 Confirm 모달 ────────────────────────────
function ConfirmModal({ message, onConfirm, onCancel }) {
  return createPortal(
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'#fff', borderRadius:S.radius, padding:24, maxWidth:320, width:'100%' }}>
        <p style={{ fontSize:14, color:S.text, marginBottom:20, lineHeight:1.6 }}>{message}</p>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onCancel} style={btn({ flex:1 })}>취소</button>
          <button onClick={onConfirm} style={btnDanger({ flex:1 })}>확인</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── 날짜 초기화 헬퍼 (SSR 안전) ──────────────────
function buildWeekPlan() {
  const days = [];
  for (let i = 0; i < 28; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dow = d.getDay();
    days.push({
      date: d.toISOString().split('T')[0],
      city: '', env: 'indoor', place: '오피스',
      occasion: '비즈니스 캐주얼',
      active: dow !== 0 && dow !== 6 && i < 5,
    });
  }
  return days;
}

// ── 메인 컴포넌트 ─────────────────────────────────
export default function Home() {
  // 탭
  const [tab, setTab] = useState('recommend');

  // 옷장
  const [clothes, setClothes] = useState([]);
  const [catFilter, setCatFilter] = useState('전체');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  // 일정/추천
  const [schedules, setSchedules] = useState([
    { city:'', time:'08:00', env:'outdoor', place:'실외 이동', isHome:true },
    { city:'', time:'09:00', env:'indoor',  place:'오피스',   isHome:false },
  ]);
  const [occasion, setOccasion]       = useState('비즈니스 캐주얼');
  const [weatherList, setWeatherList] = useState([]);
  const [outfits, setOutfits]         = useState([]);
  const [loading, setLoading]         = useState(false);

  // 주간
  const [recommendMode, setRecommendMode] = useState('today');
  const [weekPlan, setWeekPlan]   = useState([]); // useEffect에서 초기화 (SSR 안전)
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekOutfits, setWeekOutfits] = useState([]);
  const [confirmedDates, setConfirmedDates] = useState(new Set()); // 확정된 날짜
  const [regenLoading, setRegenLoading] = useState({}); // { date: bool }
  const [weekLoading, setWeekLoading] = useState(false);
  const [packingList, setPackingList] = useState('');

  // 모달
  const [modalOpen, setModalOpen]     = useState(false);
  const [addTab, setAddTab]           = useState('url');
  const [editingId, setEditingId]     = useState(null);
  const [clothForm, setClothForm]     = useState({ name:'', category:'상의', temp_min:'', temp_max:'', style:'', color:'', brand:'', price:'', season:'', purchase_date:'', preference:3 });
  const [resultTags, setResultTags]   = useState(null);
  const [pendingItems, setPendingItems] = useState([]);
  const [colorOptions, setColorOptions] = useState([]);

  // URL 등록
  const [shopUrl, setShopUrl]         = useState('');
  const [urlLoading, setUrlLoading]   = useState(false);
  const [fetchedImage, setFetchedImage] = useState('');
  const [removingBg, setRemovingBg]   = useState(false);
  const [imageBase64, setImageBase64] = useState(null);
  const [imageType, setImageType]     = useState(null);
  const [batchMode, setBatchMode]     = useState(false);
  const [batchUrls, setBatchUrls]     = useState('');
  const [batchItems, setBatchItems]   = useState([]);
  const [batchLoading, setBatchLoading] = useState(false);

  // 사진 등록
  const [analyzeLoading, setAnalyzeLoading] = useState(false);

  // 주문내역 등록
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderItems, setOrderItems]     = useState([]);
  const [orderUrlMap, setOrderUrlMap]   = useState({}); // { itemId: url }
  const [orderUrlLoading, setOrderUrlLoading] = useState({}); // { itemId: bool }

  // 설정
  const [settings, setSettings] = useState({ home_city:'', cold_sensitivity:0, layering:'auto' });

  // UI
  const [toast, setToast]         = useState('');
  const [confirm, setConfirm]     = useState(null); // { message, onConfirm }
  const [restoreProgress, setRestoreProgress] = useState(null); // { done, total, log }
  const [mounted, setMounted]     = useState(false);

  // ── 초기화 (클라이언트 전용) ─────────────────────
  useEffect(() => {
    setMounted(true);
    // clothes는 아래 mounted useEffect에서 이미지 포함해서 로드
    setSettings(LS.get('settings', { home_city:'', cold_sensitivity:0, layering:'auto' }));
    setWeekPlan(buildWeekPlan());
    setClothForm(f => ({ ...f, purchase_date: new Date().toISOString().split('T')[0] }));
    // 주간 코디 복원
    const savedWeekOutfits = LS.get('weekOutfits', []);
    if (savedWeekOutfits.length > 0) {
      setWeekOutfits(savedWeekOutfits);
      // 날씨 없는 항목 백그라운드로 보완
      const savedSettings = LS.get('settings', { home_city:'' });
      const homeCity = savedSettings.home_city;
      if (homeCity) {
        const needWeather = savedWeekOutfits.filter(o => !o.weather);
        if (needWeather.length > 0) {
          Promise.all(needWeather.map(async o => {
            try {
              const r = await fetch(`/api/weather?city=${encodeURIComponent(homeCity)}&time=09:00`);
              const w = await r.json();
              return { date: o.date, weather: w };
            } catch { return null; }
          })).then(results => {
            setWeekOutfits(prev => {
              const weatherMap = Object.fromEntries(results.filter(Boolean).map(r=>[r.date, r.weather]));
              const updated = prev.map(o => weatherMap[o.date] ? {...o, weather: weatherMap[o.date]} : o);
              LS.set('weekOutfits', updated);
              return updated;
            });
          });
        }
      }
    }
    const savedPackingList = LS.get('packingList', []);
    if (savedPackingList.length > 0) setPackingList(savedPackingList);
    const savedConfirmed = LS.get('confirmedDates', []);
    if (savedConfirmed.length > 0) setConfirmedDates(new Set(savedConfirmed));
  }, []);

  // ── 헬퍼 ─────────────────────────────────────────
  const showToast = useCallback((msg) => { setToast(msg); setTimeout(()=>setToast(''), 2500); }, []);

  const showConfirm = (message, onConfirm) => setConfirm({ message, onConfirm });

  const saveClothes = useCallback(async (updated) => {
    setClothes(updated);
    // 이미지 저장 완료 기다린 후 LS 저장
    const toStore = await Promise.all(updated.map(async c => {
      const { image, ...rest } = c;
      if (image) {
        await ImageStore.set(c.id, image); // 완료 보장
        return { ...rest, hasImage: true };
      }
      return { ...rest, hasImage: false };
    }));
    LS.set('clothes', toStore);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    // localStorage에서 raw JSON 직접 파싱 (JSON.parse로 image 필드 포함 전체 복원)
    let raw = [];
    try {
      const stored = localStorage.getItem('clothes');
      raw = stored ? JSON.parse(stored) : [];
    } catch { raw = []; }

    const withImages = raw.map(c => {
      // 케이스 1: 신버전 - hasImage 플래그 → img_{id} 키에서 로드
      if (c.hasImage) {
        const img = localStorage.getItem('img_' + c.id);
        return { ...c, image: img || null };
      }
      // 케이스 2: 구버전 - image 필드에 base64 직접 포함
      if (c.image && c.image.startsWith('data:')) {
        // img_{id}로 이전 저장
        try { localStorage.setItem('img_' + c.id, c.image); } catch(e) { console.warn('이미지 이전 실패:', c.id); }
        return { ...c, hasImage: true };
      }
      // 케이스 3: img_{id} 키에 이미지가 있는데 hasImage 플래그만 없는 경우
      const imgFallback = localStorage.getItem('img_' + c.id);
      if (imgFallback) return { ...c, image: imgFallback, hasImage: true };

      return { ...c, image: null };
    });

    setClothes(withImages);

    // 신버전 포맷으로 정리 (image 인라인 필드 제거, hasImage 플래그로 교체)
    const toStore = withImages.map(c => {
      const { image, ...rest } = c;
      return { ...rest, hasImage: !!localStorage.getItem('img_' + c.id) };
    });
    try { localStorage.setItem('clothes', JSON.stringify(toStore)); } catch(e) { console.warn('clothes 재저장 실패:', e); }
  }, [mounted]);

  const fetchWeather = async (city, time) => {
    const r = await fetch(`/api/weather?city=${encodeURIComponent(city)}&time=${time}`);
    if (!r.ok) throw new Error(`날씨 오류 (${city})`);
    return r.json();
  };

  // ── 코디 추천 ─────────────────────────────────────
  const getRecommendation = async () => {
    if (clothes.length === 0) return showToast('먼저 옷을 등록해주세요');
    const homeCity = settings.home_city;
    if (!homeCity) return showToast('설정에서 집 지역을 입력해주세요');
    setLoading(true); setOutfits([]); setWeatherList([]);
    try {
      const locs = schedules.map(s => ({ ...s, city: s.isHome ? homeCity : s.city }));
      const outdoorLocs = locs.filter(l => l.env==='outdoor' && l.city);
      const wResults = await Promise.all(outdoorLocs.map(l => fetchWeather(l.city, l.time)));
      const wMap = {};
      outdoorLocs.forEach((l,i) => { wMap[l.city+l.time] = wResults[i]; });
      const wList = locs.map(l => {
        if (l.env==='indoor') return { city:l.place, time:l.time, temp:INDOOR_TEMPS[l.place]||21, feels_like:INDOOR_TEMPS[l.place]||21, condition:`실내(${l.place})`, chance_of_rain:0, isIndoor:true };
        return wMap[l.city+l.time] || { city:l.city, time:l.time, temp:15, feels_like:13, condition:'정보없음', chance_of_rain:0 };
      });
      setWeatherList(wList);
      const today = new Date();
      const clothText = ['아우터','상의','하의','원피스','신발'].map(cat => {
        const items = clothes.filter(c => c.category===cat);
        if (!items.length) return '';
        return `[${cat}] ` + items.map(c => {
          if (c.last_worn) {
            const diffDays = Math.floor((today - new Date(c.last_worn)) / 86400000);
            if (diffDays < 2) return `${c.name}(착용불가-${diffDays}일전착용)`;
          }
          return `${c.name}(${c.temp_min}~${c.temp_max}C,선호도${c.preference||3})`;
        }).join(', ');
      }).filter(Boolean).join('\n');
      const weatherText = wList.map(w => `- ${w.time} [${w.isIndoor?'실내':'실외'}] ${w.city}: ${w.temp}°C`).join('\n');
      const outdoorTemps = wList.filter(w=>!w.isIndoor).map(w=>w.feels_like).filter(Boolean);
      const minTemp = outdoorTemps.length ? Math.min(...outdoorTemps) : 15;
      const hasRain = wList.some(w=>!w.isIndoor && w.chance_of_rain>30);
      const r = await fetch('/api/claude', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          model:'claude-sonnet-4-20250514', max_tokens:1000,
          system:'패션 스타일리스트. 옷장과 날씨로 최적 코디를 JSON으로만 추천. 다른 텍스트 없음.',
          messages:[{ role:'user', content:`오늘 일정:\n${weatherText}\n실외 최저체감: ${minTemp}°C\n${hasRain?'우천 가능':''}\n일정: ${occasion}\n\n옷장:\n${clothText}\n\n코디 3가지 추천. 선호도 높은 옷 우선. (착용불가) 표시된 옷은 절대 추천 금지.\n레이어링: ${settings.layering==='inner'?'셔츠/자켓 안에 이너 티셔츠를 받쳐 입는 것을 선호':settings.layering==='no_inner'?'셔츠/자켓 안에 이너 없이 단독 착용 선호':'상황에 따라 자유롭게 레이어링 결정'}.\n\n{"outfits":[{"outer":"이름또는null","top":"이름","inner":"이너티셔츠이름또는null","bottom":"이름또는null","reason":"이유"}]}` }]
        })
      });
      const data = await r.json();
      const text = data.content?.[0]?.text?.replace(/```json|```/g,'').trim()||'{}';
      setOutfits(JSON.parse(text).outfits||[]);
    } catch(e) { showToast(e.message||'오류 발생'); console.error(e); }
    finally { setLoading(false); }
  };

  // ── 착용 기록 ─────────────────────────────────────
  const markWorn = (clothName) => {
    const today = new Date().toISOString().split('T')[0];
    const updated = clothes.map(c => c.name===clothName ? { ...c, last_worn:today } : c);
    saveClothes(updated);
    showToast(`"${clothName}" 착용 기록됨`);
  };

  // ── 누끼따기 ─────────────────────────────────────
  const removeBackground = async (imageUrl) => {
    setRemovingBg(true);
    try {
      const r = await fetch('/api/remove-bg', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ imageUrl }) });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      setFetchedImage('data:image/png;base64,' + data.base64);
      setImageBase64(data.base64);
      setImageType('image/png');
    } catch(e) { showToast('누끼 처리 실패: ' + e.message); console.error(e); }
    finally { setRemovingBg(false); }
  };

  // ── 주문 내역 파싱 ────────────────────────────────
  // 파일 → base64 변환 헬퍼
  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve({ b64: e.target.result.split(',')[1], mt: file.type });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const parseOrderImage = async (files) => {
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;
    setOrderLoading(true); setOrderItems([]);
    try {
      // 여러 장 병렬 분석
      const results = await Promise.allSettled(fileArr.map(async (file) => {
        const { b64, mt } = await fileToBase64(file);
        const r = await fetch('/api/claude', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            model:'claude-sonnet-4-20250514', max_tokens:1500,
            system:'쇼핑몰 주문 내역 이미지 분석. JSON만 반환. 카테고리: 아우터/상의/하의/원피스/신발/액세서리. 온도: 반팔23~35, 긴팔17~24, 맨투맨12~20, 니트/가디건10~20, 자켓12~20, 코트-5~10, 패딩-15~5, 반바지23~35, 슬랙스10~28, 청바지5~22. 색상과 사이즈는 주문 옵션에서 정확히 읽을 것. 소재는 상품명에서 추론(예:코튼→면, 니트→울/아크릴, 린넨, 데님 등). 계절: 봄/가을(10~22도), 여름(23~35도), 겨울(-15~12도), 사계절. 2PACK/세트는 개수만큼 개별 분리. {"items":[{"name":"상품명(팩/세트 표기 제거)","brand":"브랜드","color":"색상","size":"사이즈","price":"가격","category":"카테고리","material":["소재"],"season":"계절","temp_min":숫자,"temp_max":숫자,"purchase_date":"YYYY-MM-DD"}]}',
            messages:[{ role:'user', content:[
              { type:'image', source:{ type:'base64', media_type:mt, data:b64 } },
              { type:'text', text:'모든 상품 정보를 추출해주세요. 색상은 실제 구매 색상으로.' }
            ]}]
          })
        });
        const data = await r.json();
        const text = data.content?.[0]?.text?.replace(/```json|```/g,'').trim()||'{}';
        return JSON.parse(text).items || [];
      }));
      const allItems = results
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value)
        .map(item => ({
          id: Math.random().toString(36).slice(2),
          ...item, checked:true,
          temp_min:String(item.temp_min||''), temp_max:String(item.temp_max||''),
          size:item.size||'',
          material: Array.isArray(item.material) ? item.material.join(', ') : (item.material||''),
          season: item.season||'',
          image:null,
        }));
      const failed = results.filter(r => r.status === 'rejected').length;
      setOrderItems(allItems);
      if (allItems.length === 0) showToast('상품을 찾지 못했어요');
      else if (failed > 0) showToast(`${allItems.length}개 인식됨 (${failed}장 실패)`);
    } catch(e) { showToast('분석 오류'); console.error(e); }
    finally { setOrderLoading(false); }
  };

  // 주문내역 상품을 URL로 보강
  const enrichItemWithUrl = async (itemId, url) => {
    if (!url || !url.startsWith('http')) return showToast('올바른 URL을 입력해주세요');
    setOrderUrlLoading(m => ({ ...m, [itemId]: true }));
    try {
      const r = await fetch('/api/parse-url', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ url }) });
      const p = await r.json();
      if (p.error) throw new Error(p.error);
      const item = p.items?.[0] || p;
      // URL 데이터로 현재 item 보강 (주문내역 정보 우선 유지, 빈 것만 채움)
      // image_url 직접 사용 (무신사 CDN은 만료 없음)
      const imageData = p.image_url || null;
      setOrderItems(o => o.map(x => {
        if (x.id !== itemId) return x;
        return {
          ...x,
          image: imageData || x.image,
          style:    (item.style||[]).join(', ')    || x.style    || '',
          material: (item.material||[]).join(', ') || x.material || '',
          season:   item.season || x.season || '',
          brand:    x.brand    || p.brand    || '',
          color:    x.color    || (item.colors?.length===1 ? item.colors[0] : ''),
          colors:   item.colors || [],
          temp_min: x.temp_min || String(item.temp_min || ''),
          temp_max: x.temp_max || String(item.temp_max || ''),
          enriched: true,
        };
      }));
      showToast(imageData && imageData.startsWith('data:') ? '이미지·정보 보강 완료' : 'URL 정보로 보강됐어요 (이미지 제외)');
    } catch(e) { showToast('URL 파싱 실패: ' + e.message); console.error(e); }
    finally { setOrderUrlLoading(m => ({ ...m, [itemId]: false })); }
  };

  const saveOrderItems = () => {
    const toSave = orderItems.filter(i => i.checked && i.name);
    if (toSave.length===0) return showToast('저장할 아이템을 선택해주세요');
    const newClothes = toSave.map(i => ({
      id: Date.now().toString()+Math.random().toString(36).slice(2),
      name:i.name, brand:i.brand||'', price:i.price||'', color:i.color||'', size:i.size||'',
      category:i.category||'상의', temp_min:parseInt(i.temp_min)||10, temp_max:parseInt(i.temp_max)||20,
      image:i.image||null, preference:3,
      style:i.style||'', material:i.material||'', season:i.season||'',
      source_url: orderUrlMap[i.id]||'',
      purchase_date:i.purchase_date||new Date().toISOString().split('T')[0],
      added_at:new Date().toISOString(),
    }));
    const updated = [...clothes, ...newClothes];
    saveClothes(updated);
    setModalOpen(false); resetModal();
    showToast(newClothes.length+'개 저장됨');
  };

  // ── 여러 URL 일괄 등록 ────────────────────────────
  const fetchBatch = async () => {
    const urls = batchUrls.split('\n').map(u=>u.trim()).filter(u=>u.startsWith('http'));
    if (urls.length===0) return showToast('URL을 입력해주세요');
    if (urls.length>10) return showToast('최대 10개까지 가능해요');
    setBatchLoading(true); setBatchItems([]);
    const results = await Promise.allSettled(urls.map(async url => {
      const r = await fetch('/api/parse-url', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ url }) });
      const p = await r.json();
      if (p.error) throw new Error(p.error);
      return (p.items||[p]).map(item => ({
        id: Math.random().toString(36).slice(2),
        name:item.name||'', brand:p.brand||'', price:p.price||'',
        category:item.category||'상의',
        temp_min:String(item.temp_min||''), temp_max:String(item.temp_max||''),
        style:(item.style||[]).join(', '),
        color:item.colors?.length===1?item.colors[0]:'', colors:item.colors||[],
        image:p.image_url||null, checked:true, url,
      }));
    }));
    const allItems = results.flatMap(r=>r.status==='fulfilled'?r.value:[]);
    const failed = results.filter(r=>r.status==='rejected').length;
    setBatchItems(allItems);
    setBatchLoading(false);
    if (failed>0) showToast(`${failed}개 URL 파싱 실패`);
  };

  const saveBatchItems = () => {
    const toSave = batchItems.filter(i=>i.checked&&i.name);
    if (toSave.length===0) return showToast('저장할 아이템을 선택해주세요');
    const newClothes = toSave.map(i => ({
      id: Date.now().toString()+Math.random().toString(36).slice(2),
      name:i.name, brand:i.brand, price:i.price, category:i.category,
      temp_min:parseInt(i.temp_min)||10, temp_max:parseInt(i.temp_max)||20,
      style:i.style, color:i.color, image:i.image, preference:3,
      source_url:i.url||'',
      purchase_date:new Date().toISOString().split('T')[0], added_at:new Date().toISOString(),
    }));
    const updated = [...clothes, ...newClothes];
    saveClothes(updated);
    setModalOpen(false); resetModal();
    showToast(`${newClothes.length}개 저장됨`);
  };

  // ── 단일 URL 등록 ─────────────────────────────────
  const fetchFromUrl = async () => {
    if (!shopUrl) return showToast('URL을 입력해주세요');
    setUrlLoading(true); setResultTags(null); setFetchedImage('');
    try {
      const r = await fetch('/api/parse-url', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ url:shopUrl }) });
      const p = await r.json();
      if (p.error) throw new Error(p.error);
      if (p.items && p.items.length>1) {
        const first = p.items[0]; const firstColors = first.colors||[];
        setClothForm(f=>({ ...f, name:first.name||'', category:first.category||'상의', temp_min:first.temp_min||'', temp_max:first.temp_max||'', style:(first.style||[]).join(', '), color:firstColors.length===1?firstColors[0]:'', brand:p.brand||'', price:p.price||'' }));
        setColorOptions(firstColors.length>1?firstColors:[]);
        if (p.image_url) setFetchedImage(p.image_url);
        setResultTags({ ...p, isSet:true, setCount:p.items.length });
        setPendingItems(p.items.slice(1).map(item=>({ ...item, brand:p.brand||'', price:p.price||'', image:p.image_url||null })));
      } else {
        const item = p.items?.[0]||p; const colors = item.colors||[];
        setClothForm(f=>({ ...f, name:item.name||'', category:item.category||'상의', temp_min:item.temp_min||'', temp_max:item.temp_max||'', style:(item.style||[]).join(', '), color:colors.length===1?colors[0]:'', brand:p.brand||'', price:p.price||'' }));
        if (p.image_url) setFetchedImage(p.image_url);
        setResultTags(p); setPendingItems([]); setColorOptions(colors.length>1?colors:[]);
      }
    } catch(e) { showToast('상품 정보를 가져오지 못했어요'); console.error(e); }
    finally { setUrlLoading(false); }
  };

  // ── 사진 분석 ─────────────────────────────────────
  const handlePhoto = async (file) => {
    if (!file.type.startsWith('image/')) return showToast('이미지만 가능해요');
    const reader = new FileReader();
    reader.onload = async (e) => {
      const b64 = e.target.result.split(',')[1]; const mt = file.type;
      setImageBase64(b64); setImageType(mt); setAnalyzeLoading(true);
      try {
        const r = await fetch('/api/claude', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:800, system:'패션 전문가. 옷 사진 분석해 JSON만 반환. {"category":"아우터/상의/하의/원피스/신발/액세서리","name":"색상+종류","colors":["색상"],"material":["소재"],"style":["캐주얼/포멀/미니멀/스트릿/스포티/빈티지"],"temp_min":숫자,"temp_max":숫자}', messages:[{ role:'user', content:[{ type:'image', source:{ type:'base64', media_type:mt, data:b64 } },{ type:'text', text:'분석해주세요.' }] }] })
        });
        const data = await r.json();
        const p = JSON.parse(data.content?.[0]?.text?.replace(/```json|```/g,'').trim()||'{}');
        setClothForm(f=>({ ...f, name:p.name||'', category:p.category||'상의', temp_min:p.temp_min||'', temp_max:p.temp_max||'', style:(p.style||[]).join(', '), color:(p.colors||[]).join(', ') }));
        setResultTags(p);
      } catch(e) { showToast('분석 오류'); console.error(e); }
      finally { setAnalyzeLoading(false); }
    };
    reader.readAsDataURL(file);
  };

  // ── 옷 저장 ───────────────────────────────────────
  const saveCloth = () => {
    if (!clothForm.name) return showToast('옷 이름을 입력해주세요');
    if (!clothForm.temp_min||!clothForm.temp_max) return showToast('온도 범위를 입력해주세요');
    const image = imageBase64 ? `data:${imageType};base64,${imageBase64}` : (fetchedImage||null);
    if (editingId) {
      const updated = clothes.map(c => c.id===editingId ? { ...c, ...clothForm, temp_min:parseInt(clothForm.temp_min), temp_max:parseInt(clothForm.temp_max), preference:parseInt(clothForm.preference), image:image||c.image } : c);
      saveClothes(updated);
      setModalOpen(false); resetModal();
      showToast(`"${clothForm.name}" 수정됨`);
    } else {
      const newCloth = { id:Date.now().toString(), ...clothForm, temp_min:parseInt(clothForm.temp_min), temp_max:parseInt(clothForm.temp_max), preference:parseInt(clothForm.preference), image, size:clothForm.size||'', source_url:shopUrl||'', added_at:new Date().toISOString() };
      const updated = [...clothes, newCloth];
      saveClothes(updated);
      if (pendingItems.length>0) {
        const next = pendingItems[0];
        setClothForm(f=>({ ...f, name:next.name||'', category:next.category||'상의', temp_min:String(next.temp_min||''), temp_max:String(next.temp_max||''), style:(next.style||[]).join(', '), color:(next.colors||[]).join(', '), brand:next.brand||'', price:next.price||'' }));
        if (next.image) setFetchedImage(next.image);
        setImageBase64(null); setImageType(null);
        setPendingItems(pendingItems.slice(1));
        showToast(`"${clothForm.name}" 저장됨. 다음 아이템을 확인해주세요.`);
      } else {
        setModalOpen(false); resetModal();
        showToast(`"${clothForm.name}" 추가됨`);
      }
    }
  };

  const resetModal = () => {
    setClothForm({ name:'', category:'상의', temp_min:'', temp_max:'', style:'', color:'', size:'', brand:'', price:'', season:'', purchase_date:new Date().toISOString().split('T')[0], preference:3 });
    setShopUrl(''); setFetchedImage(''); setImageBase64(null); setImageType(null);
    setResultTags(null); setAddTab('url'); setEditingId(null); setPendingItems([]); setColorOptions([]);
    setBatchMode(false); setBatchItems([]); setBatchUrls(''); setOrderItems([]); setOrderUrlMap({}); setOrderUrlLoading({});
  };

  const openEditModal = (c) => {
    setEditingId(c.id);
    setClothForm({ name:c.name, category:c.category, temp_min:String(c.temp_min), temp_max:String(c.temp_max), style:c.style||'', color:c.color||'', size:c.size||'', brand:c.brand||'', price:c.price||'', season:c.season||'', purchase_date:c.purchase_date||new Date().toISOString().split('T')[0], preference:c.preference||3 });
    if (c.image) setFetchedImage(c.image);
    setImageBase64(null); setImageType(null); setResultTags(null); setAddTab('url'); setShopUrl('');
    setModalOpen(true);
  };

  const deleteCloth = (id) => {
    showConfirm('이 옷을 삭제할까요?', () => {
      ImageStore.del(id);
      const u = clothes.filter(c=>c.id!==id);
      saveClothes(u);
      setConfirm(null);
    });
  };

  const deleteSelected = () => {
    showConfirm(`선택한 ${selectedIds.size}개를 삭제할까요?`, () => {
      selectedIds.forEach(id => ImageStore.del(id));
      const updated = clothes.filter(c => !selectedIds.has(c.id));
      saveClothes(updated);
      setSelectedIds(new Set());
      setSelectMode(false);
      setConfirm(null);
    });
  };

  const toggleSelect = (e, id) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── 주간 추천 ─────────────────────────────────────
  const getWeekRecommendation = async () => {
    const homeCity = settings.home_city;
    if (!homeCity) return showToast('설정에서 집 지역을 입력해주세요');
    if (clothes.length===0) return showToast('먼저 옷을 등록해주세요');
    const activeDays = weekPlan.filter(d=>d.active);
    if (activeDays.length===0) return showToast('하루 이상 선택해주세요');
    setWeekLoading(true); setWeekOutfits([]); setPackingList('');
    try {
      const weatherDays = await Promise.all(activeDays.map(async d => {
        const city = d.city||homeCity;
        try {
          const r = await fetch(`/api/weather?city=${encodeURIComponent(city)}&time=09:00`);
          const w = await r.json();
          return { ...d, city, weather:w };
        } catch { return { ...d, city, weather:{ temp:15, feels_like:13, condition:'정보없음', chance_of_rain:0 } }; }
      }));
      const today = new Date();
      const clothText = ['아우터','상의','하의','원피스','신발'].map(cat => {
        const items = clothes.filter(c=>c.category===cat);
        if (!items.length) return '';
        return `[${cat}] `+items.map(c => {
          if (c.last_worn) {
            const diffDays = Math.floor((today - new Date(c.last_worn)) / 86400000);
            if (diffDays<2) return `${c.name}(착용불가)`;
          }
          return `${c.name}(${c.temp_min}~${c.temp_max}C)`;
        }).join(', ');
      }).filter(Boolean).join('\n');
      const dayText = weatherDays.map(d => {
        const dateObj = new Date(d.date);
        const dateStr = dateObj.toLocaleDateString('ko-KR',{ month:'long', day:'numeric', weekday:'short' });
        const dow = ['일','월','화','수','목','금','토'][dateObj.getDay()];
        return `- [날짜:${d.date}] ${dateStr}(${dow}요일): ${d.city} ${d.weather.temp}°C ${d.weather.condition}, ${d.env==='indoor'?d.place:'실외 활동'}, ${d.occasion}`;
      }).join('\n');
      const r = await fetch('/api/claude', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          model:'claude-sonnet-4-20250514', max_tokens:2000,
          system:'패션 스타일리스트. 주간 코디를 JSON으로만 반환. 다른 텍스트 없음. 반드시 각 일정의 [날짜:YYYY-MM-DD]를 date 필드에 그대로 사용할 것. reason에는 날짜/요일 언급 금지, 코디 이유만 간결하게.',
          messages:[{ role:'user', content:`일정:\n${dayText}\n\n내 옷장:\n${clothText}\n\n각 날짜에 맞는 코디 추천. date 필드는 반드시 위 [날짜:YYYY-MM-DD] 값 그대로 사용.\nJSON만 응답:{"outfits":[{"date":"YYYY-MM-DD","outer":"null가능","top":"이름","bottom":"null가능","reason":"코디이유만"}],"packing_list":["아이템"]}` }]
        })
      });
      const data = await r.json();
      const text = data.content?.[0]?.text?.replace(/```json|```/g,'').trim()||'{}';
      const parsed = JSON.parse(text);
      // 날씨 데이터를 outfit에 병합
      const weatherMap = Object.fromEntries(weatherDays.map(d=>[d.date, d.weather]));
      const outfitsWithWeather = (parsed.outfits||[]).map(o=>({
        ...o, weather: weatherMap[o.date] || null
      }));
      setWeekOutfits(outfitsWithWeather);
      LS.set('weekOutfits', outfitsWithWeather);
      const pl = parsed.packing_list || [];
      setPackingList(pl);
      LS.set('packingList', pl);
    } catch(e) { showToast(e.message||'오류 발생'); console.error(e); }
    finally { setWeekLoading(false); }
  };

  // ── 설정 ─────────────────────────────────────────
  const saveSettings = () => { LS.set('settings', settings); showToast('저장됨'); };
  const restoreAllImages = async () => {
    const targets = clothes.filter(c => c.source_url && !ImageStore.get(c.id));
    if (targets.length === 0) return showToast('복구할 이미지가 없어요 (이미 모두 있거나 URL 없음)');
    setRestoreProgress({ done:0, total:targets.length, log:'' });
    let done = 0;
    for (const c of targets) {
      try {
        const r1 = await fetch('/api/parse-url', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ url:c.source_url }) });
        const p = await r1.json();
        if (!p.image_url) throw new Error('이미지 URL 없음');
        // image_url 직접 저장 (무신사 CDN은 만료 없음)
        const b64 = p.image_url;
        await ImageStore.set(c.id, b64);
        done++;
        setRestoreProgress(p => ({ ...p, done, log: `✅ ${c.name}` }));
        // clothes state도 업데이트
        setClothes(prev => prev.map(x => x.id===c.id ? {...x, image:b64, hasImage:true} : x));
        // LS도 업데이트
        const stored = JSON.parse(localStorage.getItem('clothes')||'[]');
        const updated = stored.map(x => x.id===c.id ? {...x, hasImage:true} : x);
        localStorage.setItem('clothes', JSON.stringify(updated));
      } catch(e) {
        done++;
        setRestoreProgress(p => ({ ...p, done, log: `❌ ${c.name}: ${e.message}` }));
      }
    }
    setRestoreProgress(p => ({ ...p, log: `완료! ${targets.length}개 중 성공: ${done}개` }));
  };

  const regenOutfit = async (outfit) => {
    const date = outfit.date;
    setRegenLoading(m=>({...m,[date]:true}));
    try {
      const homeCity = settings.home_city || '성남시';
      const today = new Date();
      const clothText = ['아우터','상의','하의','원피스','신발'].map(cat => {
        const items = clothes.filter(c=>c.category===cat);
        if (!items.length) return '';
        // 이미 확정된 코디의 옷은 제외
        const confirmedNames = weekOutfits.filter(o=>confirmedDates.has(o.date)).flatMap(o=>[o.outer,o.top,o.bottom,o.inner].filter(Boolean));
        return `[${cat}] `+items.map(c => {
          if (confirmedNames.includes(c.name)) return `${c.name}(이미확정)`;
          if (c.last_worn) {
            const diffDays = Math.floor((today - new Date(c.last_worn)) / 86400000);
            if (diffDays<2) return `${c.name}(착용불가)`;
          }
          return `${c.name}(${c.temp_min}~${c.temp_max}C)`;
        }).join(', ');
      }).filter(Boolean).join('
');
      const dateStr = new Date(date).toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short'});
      const weatherInfo = outfit.weather ? `${outfit.weather.temp}°C ${outfit.weather.condition}` : '';
      const r = await fetch('/api/claude', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          model:'claude-sonnet-4-20250514', max_tokens:500,
          system:'패션 스타일리스트. JSON만 반환.',
          messages:[{ role:'user', content:`${dateStr} ${weatherInfo} 날 다른 코디 1가지 추천. (이미확정)(착용불가) 옷 절대 사용 금지.

옷장:
${clothText}

{"outer":"null가능","top":"이름","bottom":"null가능","reason":"이유"}` }]
        })
      });
      const data = await r.json();
      const text = data.content?.[0]?.text?.replace(/```json|```/g,'').trim()||'{}';
      const newOutfit = JSON.parse(text);
      const updated = weekOutfits.map(o => o.date===date ? {...o, ...newOutfit, date, weather:o.weather} : o);
      setWeekOutfits(updated);
      LS.set('weekOutfits', updated);
    } catch(e) { showToast('재추천 실패: '+e.message); }
    finally { setRegenLoading(m=>({...m,[date]:false})); }
  };

  const toggleConfirm = (date) => {
    setConfirmedDates(prev => {
      const next = new Set(prev);
      next.has(date) ? next.delete(date) : next.add(date);
      LS.set('confirmedDates', [...next]);
      return next;
    });
  };

  const addSchedule  = () => { if(schedules.length>=6)return showToast('최대 6개'); setSchedules(s=>[...s,{ city:'', time:'18:00', env:'outdoor', place:'실외 이동', isHome:false }]); };
  const updateSchedule = (i, key, val) => setSchedules(s=>s.map((x,idx)=>idx===i?{...x,[key]:val}:x));

  // ── 파생 데이터 ───────────────────────────────────
  const filtered = (catFilter==='전체' ? clothes : clothes.filter(c=>c.category===catFilter))
    .slice().sort((a,b)=>new Date(b.added_at||0)-new Date(a.added_at||0));

  const tabStyle = (t) => ({ padding:'7px 14px', borderRadius:99, fontSize:13, fontWeight:500, border:`1px solid ${tab===t?S.accent:S.border}`, background:tab===t?S.accent:S.surface, color:tab===t?'#fff':S.sub, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' });

  // ── 코디 카드 공통 컴포넌트 ───────────────────────
  const weatherEmoji = (w) => {
    if (!w) return '';
    const c = w.condition||'';
    if (c.includes('맑')) return '☀️';
    if (c.includes('구름') || c.includes('흐')) return '☁️';
    if (c.includes('비') || w.chance_of_rain > 50) return '🌧️';
    if (c.includes('눈')) return '❄️';
    return '🌤️';
  };

  const OutfitCard = ({ outfit, index, showDate }) => {
    const clothMap = Object.fromEntries(clothes.map(c=>[c.name,c]));
    const layers = [
      outfit.outer && { label:'아우터', name:outfit.outer },
      { label:'상의', name:outfit.top },
      outfit.bottom && { label:'하의', name:outfit.bottom },
    ].filter(l=>l&&l.name&&l.name!=='null');
    const w = outfit.weather;
    return (
      <div style={{ ...card, display:'flex', flexDirection:'column' }}>
        {/* 헤더: 날짜 + 날씨 */}
        {showDate && outfit.date && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <div style={{ fontSize:13, fontWeight:700, color:S.accent }}>
              {new Date(outfit.date).toLocaleDateString('ko-KR',{ month:'long', day:'numeric', weekday:'short' })}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:12, color:S.sub }}>
                {w ? (
                  <>
                    <span>{weatherEmoji(w)}</span>
                    <span style={{ fontWeight:600, color:S.text }}>{w.temp}°C</span>
                    {w.feels_like && w.feels_like !== w.temp && <span style={{ fontSize:10 }}>체감 {w.feels_like}°C</span>}
                    {(w.chance_of_rain > 40 || (w.condition||'').includes('비')) && (
                      <span style={{ marginLeft:2, fontSize:13 }} title={`강수확률 ${w.chance_of_rain}%`}>☂️</span>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize:11, color:S.hint }}>날씨 로딩중...</span>
                )}
              </div>
          </div>
        )}
        {!showDate && <div style={{ fontSize:11, fontWeight:500, color:S.sub, marginBottom:12 }}>코디 {index+1}</div>}
        {/* 아이템 행 - 고정 높이로 레이아웃 안정화 */}
        <div style={{ display:'flex', alignItems:'flex-start', gap:6, marginBottom:12 }}>
          {layers.map((l,li) => {
            const c = clothMap[l.name];
            return (
              <div key={l.name+li} style={{ display:'flex', alignItems:'flex-start', gap:6, flex:1, minWidth:0 }}>
                {li>0 && <span style={{ color:S.hint, fontSize:14, marginTop:30, flexShrink:0 }}>+</span>}
                <div
                  style={{ flex:1, textAlign:'center', minWidth:0, cursor:'pointer' }}
                  onClick={()=>{ if(c) openEditModal(c); }}
                  title={c ? '클릭하면 수정' : ''}
                >
                  <div style={{ width:'100%', aspectRatio:'3/4', borderRadius:S.radiusSm, background:S.bg, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:4, overflow:'hidden', border:c?`1px solid ${S.border}`:'none', position:'relative' }}>
                    {c?.image ? <img src={c.image} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : <span style={{ fontSize:20 }}>{CAT_EMOJI[c?.category||l.label]||'👔'}</span>}
                    {c && <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0)', transition:'background 0.15s' }} onMouseEnter={e=>e.target.style.background='rgba(0,0,0,0.08)'} onMouseLeave={e=>e.target.style.background='rgba(0,0,0,0)'}/>}
                  </div>
                  <div style={{ fontSize:9, color:S.hint }}>{l.label}</div>
                  <div style={{ fontSize:10, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{l.name}</div>
                  {c?.color && <div style={{ fontSize:9, color:S.hint, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.color}</div>}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ background:S.bg, borderRadius:S.radiusSm, padding:'8px 10px', fontSize:11, color:S.sub, lineHeight:1.6, marginTop:'auto', marginBottom:8 }}>{outfit.reason}</div>
        {showDate && outfit.date && (
          <div style={{ display:'flex', gap:6, marginTop:4 }}>
            <button
              onClick={()=>toggleConfirm(outfit.date)}
              style={{ flex:1, padding:'7px 0', borderRadius:8, fontSize:12, fontWeight:600, fontFamily:'inherit', cursor:'pointer', border:`1.5px solid ${confirmedDates.has(outfit.date)?'#27500A':'#C0DD97'}`, background:confirmedDates.has(outfit.date)?'#27500A':'#EAF3DE', color:confirmedDates.has(outfit.date)?'#fff':'#27500A' }}
            >{confirmedDates.has(outfit.date) ? '✓ 확정됨' : '확정하기'}</button>
            <button
              onClick={()=>regenOutfit(outfit)}
              disabled={regenLoading[outfit.date] || confirmedDates.has(outfit.date)}
              style={{ flex:1, padding:'7px 0', borderRadius:8, fontSize:12, fontWeight:500, fontFamily:'inherit', cursor:confirmedDates.has(outfit.date)?'not-allowed':'pointer', border:`1px solid ${S.border}`, background:S.surface, color:confirmedDates.has(outfit.date)?S.hint:S.sub, opacity:confirmedDates.has(outfit.date)?0.4:1 }}
            >{regenLoading[outfit.date] ? '추천 중...' : '↺ 다시 추천'}</button>
          </div>
        )}
        {!showDate && (
          <button onClick={()=>{ layers.forEach(l=>markWorn(l.name)); }} style={{ ...btn({ width:'100%', marginTop:8, fontSize:12 }) }}>
            ✓ 오늘 입었어요
          </button>
        )}
      </div>
    );
  };

  // ── 렌더 ─────────────────────────────────────────
  return (
    <>
      <Head><title>오늘 뭐 입지</title><meta name="viewport" content="width=device-width, initial-scale=1"/></Head>
      <style>{`* { box-sizing:border-box; margin:0; padding:0; } body { font-family:'Noto Sans KR',-apple-system,sans-serif; background:${S.bg}; color:${S.text}; } @keyframes spin { to { transform:rotate(360deg); } }`}</style>

      {/* 네비 */}
      <nav style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 20px', background:S.surface, borderBottom:`1px solid ${S.border}`, position:'sticky', top:0, zIndex:100 }}>
        <div style={{ fontSize:15, fontWeight:700, letterSpacing:'-0.02em' }}>오늘 뭐 입지</div>
        <div style={{ display:'flex', gap:4 }}>
          {['recommend','closet','settings'].map(t=>(
            <button key={t} style={tabStyle(t)} onClick={()=>setTab(t)}>
              {t==='recommend'?'추천':t==='closet'?'옷장':'설정'}
            </button>
          ))}
        </div>
      </nav>

      {/* ── 추천 탭 ── */}
      {tab==='recommend' && (
        <div style={{ padding:'20px 32px', maxWidth:1200, margin:'0 auto' }}>
          <div style={{ display:'flex', gap:4, marginBottom:16 }}>
            {[['today','오늘 코디'],['week','주간 / 여행']].map(([m,l])=>(
              <button key={m} onClick={()=>setRecommendMode(m)} style={{ padding:'8px 18px', borderRadius:99, fontSize:13, fontWeight:500, border:`1px solid ${recommendMode===m?S.accent:S.border}`, background:recommendMode===m?S.accent:S.surface, color:recommendMode===m?'#fff':S.sub, cursor:'pointer', fontFamily:'inherit' }}>{l}</button>
            ))}
          </div>

          {/* 오늘 코디 */}
          {recommendMode==='today' && (
            <div style={card}>
              <div style={{ fontSize:12, fontWeight:500, color:S.sub, marginBottom:12, textTransform:'uppercase', letterSpacing:'0.04em' }}>일정 입력</div>
              {schedules.map((s,i)=>(
                <div key={i} style={{ background:S.bg, borderRadius:S.radiusSm, padding:'9px 10px', marginBottom:6, borderLeft:s.isHome?`3px solid #85B7EB`:'none' }}>
                  <div style={{ display:'flex', gap:5, alignItems:'center' }}>
                    <input value={s.isHome?'집':s.city} disabled={s.isHome} placeholder="장소명" onChange={e=>updateSchedule(i,'city',e.target.value)}
                      style={{ flex:'1.4', border:`1px solid ${S.border}`, borderRadius:8, padding:'6px 9px', fontSize:12, fontFamily:'inherit', background:s.isHome?S.bg:S.surface, color:s.isHome?S.sub:S.text, outline:'none', minWidth:0 }}/>
                    <select value={s.time} onChange={e=>updateSchedule(i,'time',e.target.value)} style={{ border:`1px solid ${S.border}`, borderRadius:8, padding:'6px 6px', fontSize:11, fontFamily:'inherit', background:S.surface, color:S.text, outline:'none', flexShrink:0 }}>
                      {TIME_OPTS.map((t,ti)=><option key={t} value={t}>{TIME_LABELS[ti]}</option>)}
                    </select>
                    <button onClick={()=>{updateSchedule(i,'env','outdoor');updateSchedule(i,'place','실외 이동');}} style={{ padding:'4px 8px', borderRadius:99, fontSize:11, fontWeight:500, border:`1px solid ${s.env==='outdoor'?'#85B7EB':S.border}`, background:s.env==='outdoor'?'#E6F1FB':S.surface, color:s.env==='outdoor'?'#0C447C':S.sub, cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>실외</button>
                    <button onClick={()=>{updateSchedule(i,'env','indoor');updateSchedule(i,'place','오피스');}} style={{ padding:'4px 8px', borderRadius:99, fontSize:11, fontWeight:500, border:`1px solid ${s.env==='indoor'?'#EF9F27':S.border}`, background:s.env==='indoor'?'#FAEEDA':S.surface, color:s.env==='indoor'?'#633806':S.sub, cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>실내</button>
                    <select value={s.place} onChange={e=>updateSchedule(i,'place',e.target.value)} style={{ flex:1, border:`1px solid ${S.border}`, borderRadius:8, padding:'6px 6px', fontSize:11, fontFamily:'inherit', background:S.surface, color:S.sub, outline:'none', minWidth:0 }}>
                      {(s.env==='indoor'?INDOOR_PLACES:OUTDOOR_PLACES).map(p=><option key={p} value={p}>{p}</option>)}
                    </select>
                    {!s.isHome && <button onClick={()=>setSchedules(s=>s.filter((_,idx)=>idx!==i))} style={{ background:'none', border:'none', color:S.hint, cursor:'pointer', fontSize:13, padding:'0 2px', flexShrink:0 }}>✕</button>}
                  </div>
                </div>
              ))}
              <button onClick={addSchedule} style={{ fontSize:12, color:S.sub, cursor:'pointer', padding:'6px 0', display:'inline-flex', alignItems:'center', gap:4, background:'none', border:'none', fontFamily:'inherit', marginTop:4 }}>+ 일정 추가</button>
              <div style={{ marginTop:10 }}>
                <div style={labelSt}>일정 성격</div>
                <select value={occasion} onChange={e=>setOccasion(e.target.value)} style={{ ...inputSt(), marginTop:4 }}>
                  {OCCASIONS.map(o=><option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <button onClick={getRecommendation} style={{ ...btnPrimary({ width:'100%', marginTop:14 }) }}>코디 추천받기</button>
            </div>
          )}

          {/* 주간/여행 */}
          {recommendMode==='week' && (
            <div style={card}>
              <div style={{ fontSize:12, fontWeight:500, color:S.sub, marginBottom:12, textTransform:'uppercase', letterSpacing:'0.04em' }}>주간 일정</div>
              <div style={{ display:'flex', gap:4, marginBottom:12 }}>
                {[0,1,2,3].map(w=>(
                  <button key={w} onClick={()=>setWeekOffset(w)} style={{ flex:1, padding:'6px 0', borderRadius:8, fontSize:11, fontWeight:500, border:`1px solid ${weekOffset===w?S.accent:S.border}`, background:weekOffset===w?S.accent:S.surface, color:weekOffset===w?'#fff':S.sub, cursor:'pointer', fontFamily:'inherit' }}>
                    {w===0?'이번주':w===1?'다음주':w===2?'다다음주':'3주후'}
                  </button>
                ))}
              </div>
              {weekPlan.slice(weekOffset*7, weekOffset*7+7).map((d,idx)=>{
                const i = weekOffset*7+idx;
                const dateObj = new Date(d.date);
                const dateStr = dateObj.toLocaleDateString('ko-KR',{ month:'numeric', day:'numeric', weekday:'short' });
                const isWeekend = dateObj.getDay()===0||dateObj.getDay()===6;
                return (
                  <div key={d.date} style={{ display:'flex', gap:6, alignItems:'center', marginBottom:8, opacity:d.active?1:0.4 }}>
                    <button onClick={()=>setWeekPlan(wp=>wp.map((p,pi)=>pi===i?{...p,active:!p.active}:p))} style={{ width:36, flexShrink:0, padding:'4px 0', borderRadius:8, fontSize:11, fontWeight:500, border:`1px solid ${d.active?S.accent:S.border}`, background:d.active?S.accent:S.surface, color:d.active?'#fff':S.sub, cursor:'pointer', fontFamily:'inherit', textAlign:'center' }}>{dateStr.slice(0,dateStr.indexOf('('))}</button>
                    <span style={{ fontSize:11, color:isWeekend?'#E24B4A':S.sub, flexShrink:0, width:20 }}>{dateStr.slice(dateStr.indexOf('('))}</span>
                    <input value={d.city} onChange={e=>setWeekPlan(wp=>wp.map((p,pi)=>pi===i?{...p,city:e.target.value}:p))} placeholder={settings.home_city||'도시명'} disabled={!d.active} style={{ flex:1, border:`1px solid ${S.border}`, borderRadius:8, padding:'5px 8px', fontSize:11, fontFamily:'inherit', background:S.surface, color:S.text, outline:'none', minWidth:0 }}/>
                    <select value={d.place} onChange={e=>setWeekPlan(wp=>wp.map((p,pi)=>pi===i?{...p,place:e.target.value,env:INDOOR_PLACES.includes(e.target.value)?'indoor':'outdoor'}:p))} disabled={!d.active} style={{ border:`1px solid ${S.border}`, borderRadius:8, padding:'5px 6px', fontSize:11, fontFamily:'inherit', background:S.surface, color:S.sub, outline:'none', flexShrink:0 }}>
                      {[...OUTDOOR_PLACES,...INDOOR_PLACES].map(p=><option key={p} value={p}>{p}</option>)}
                    </select>
                    <select value={d.occasion} onChange={e=>setWeekPlan(wp=>wp.map((p,pi)=>pi===i?{...p,occasion:e.target.value}:p))} disabled={!d.active} style={{ border:`1px solid ${S.border}`, borderRadius:8, padding:'5px 6px', fontSize:11, fontFamily:'inherit', background:S.surface, color:S.sub, outline:'none', flexShrink:0 }}>
                      {OCCASIONS.map(o=><option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                );
              })}
              <button onClick={getWeekRecommendation} style={{ ...btnPrimary({ width:'100%', marginTop:8 }) }}>주간 코디 추천받기</button>
            </div>
          )}

          {/* 날씨 */}
          {weatherList.length>0 && (
            <div style={card}>
              <div style={{ fontSize:12, fontWeight:500, color:S.sub, marginBottom:12 }}>오늘 날씨</div>
              {weatherList.map((w,i)=>(
                <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', background:S.bg, borderRadius:S.radiusSm, marginBottom:6 }}>
                  <div>
                    <div style={{ fontSize:11, color:S.sub }}>{w.time} {w.isIndoor&&<span style={{ background:'#FAEEDA', color:'#633806', fontSize:10, padding:'1px 6px', borderRadius:99, marginLeft:4 }}>실내</span>}</div>
                    <div style={{ fontSize:12 }}>{w.city}{!w.isIndoor&&` · ${w.condition}`}</div>
                  </div>
                  <div style={{ fontSize:18, fontWeight:700, marginLeft:'auto' }}>{w.temp}°C</div>
                </div>
              ))}
            </div>
          )}

          {/* 로딩 */}
          {(loading||weekLoading) && (
            <div style={card}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:20, height:20, border:`2px solid ${S.border}`, borderTopColor:S.accent, borderRadius:'50%', animation:'spin 0.7s linear infinite' }}></div>
                <span style={{ fontSize:13, color:S.sub }}>{weekLoading?'7일치 날씨 조회 및 AI 코디 생성 중...':'AI가 코디를 고르는 중...'}</span>
              </div>
            </div>
          )}

          {/* 주간 결과 */}
          {weekOutfits.length > 0 && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
              <span style={{ fontSize:12, color:S.sub }}>주간 코디 — 탭 나가도 유지돼요</span>
              <button onClick={()=>{ setWeekOutfits([]); setPackingList([]); setConfirmedDates(new Set()); LS.set('weekOutfits',[]); LS.set('packingList',[]); LS.set('confirmedDates',[]); }} style={{ fontSize:11, color:S.hint, background:'none', border:'none', cursor:'pointer', fontFamily:'inherit' }}>초기화</button>
            </div>
          )}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:12 }}>
            {weekOutfits.map((o,i)=><OutfitCard key={o.date||i} outfit={o} index={i} showDate={true}/>)}
          </div>

          {packingList && packingList.length>0 && (
            <div style={{ ...card, border:`1.5px solid #85B7EB` }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#0C447C', marginBottom:10 }}>✈️ 짐싸기 리스트</div>
              {packingList.map((item,i)=>(
                <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0', borderBottom:`1px solid ${S.border}`, fontSize:13, color:S.text }}>
                  <span style={{ color:S.hint }}>•</span> {item}
                </div>
              ))}
            </div>
          )}

          {/* 오늘 코디 결과 */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:12 }}>
            {outfits.map((o,i)=><OutfitCard key={i} outfit={o} index={i} showDate={false}/>)}
          </div>
        </div>
      )}

      {/* ── 옷장 탭 ── */}
      {tab==='closet' && (
        <div style={{ padding:'20px 32px', maxWidth:1200, margin:'0 auto' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <div style={{ fontSize:18, fontWeight:700, letterSpacing:'-0.02em' }}>내 옷장 <span style={{ fontSize:13, color:S.sub, fontWeight:400 }}>{clothes.length}개</span></div>
            <div style={{ display:'flex', gap:8 }}>
              {selectMode && selectedIds.size > 0 && (
                <button onClick={deleteSelected} style={btnDanger({ padding:'7px 14px', fontSize:12 })}>
                  {selectedIds.size}개 삭제
                </button>
              )}
              <button onClick={()=>{ setSelectMode(m=>!m); setSelectedIds(new Set()); }} style={{ ...btn({ padding:'7px 14px', fontSize:12 }), ...(selectMode?{background:S.bg, borderColor:S.accent, color:S.accent}:{}) }}>
                {selectMode ? '취소' : '선택 삭제'}
              </button>
            </div>
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
            {['전체',...CATEGORIES.filter(c=>c!=='액세서리')].map(c=>(
              <button key={c} onClick={()=>setCatFilter(c)} style={{ padding:'6px 12px', borderRadius:99, fontSize:12, fontWeight:500, border:`1px solid ${catFilter===c?S.accent:S.border}`, background:catFilter===c?S.accent:S.surface, color:catFilter===c?'#fff':S.sub, cursor:'pointer', fontFamily:'inherit' }}>{c}</button>
            ))}
          </div>
          {filtered.length===0 ? (
            <div style={{ textAlign:'center', padding:'48px 20px', color:S.sub }}>
              <div style={{ fontSize:40, marginBottom:12 }}>👕</div>
              <p style={{ fontSize:14 }}>등록된 옷이 없어요</p>
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:12 }}>
              {filtered.map(c=>(
                <div key={c.id}
                  onClick={()=> selectMode ? toggleSelect({stopPropagation:()=>{}}, c.id) : openEditModal(c)}
                  style={{ background:S.surface, border:`1.5px solid ${selectMode && selectedIds.has(c.id) ? S.accent : S.border}`, borderRadius:S.radiusSm, padding:'10px 8px', textAlign:'left', position:'relative', cursor:'pointer', display:'flex', flexDirection:'column', height:'100%', transition:'border-color 0.15s' }}>
                  {selectMode && (
                    <div onClick={e=>toggleSelect(e, c.id)} style={{ position:'absolute', top:6, right:6, width:20, height:20, borderRadius:6, border:`2px solid ${selectedIds.has(c.id)?S.accent:S.border}`, background:selectedIds.has(c.id)?S.accent:'#fff', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1, cursor:'pointer' }}>
                      {selectedIds.has(c.id) && <span style={{ color:'#fff', fontSize:12, fontWeight:700 }}>✓</span>}
                    </div>
                  )}
                  <div style={{ width:'100%', height:140, borderRadius:8, background:S.bg, overflow:'hidden', flexShrink:0, marginBottom:6, display:'flex', alignItems:'center', justifyContent:'center', position:'relative' }}
                    onClick={e=>{ if(selectMode) return; e.stopPropagation(); document.getElementById('img-replace-'+c.id).click(); }}>
                    {c.image ? <img src={c.image} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : <span style={{ fontSize:28 }}>{CAT_EMOJI[c.category]||'👔'}</span>}
                    {!selectMode && <div style={{ position:'absolute', bottom:4, right:4, background:'rgba(0,0,0,0.45)', borderRadius:4, padding:'2px 5px', fontSize:9, color:'#fff', pointerEvents:'none' }}>교체</div>}
                    <input id={'img-replace-'+c.id} type="file" accept="image/*" style={{ display:'none' }} onClick={e=>e.stopPropagation()} onChange={e=>{
                      if(!e.target.files[0]) return;
                      const reader = new FileReader();
                      reader.onload = ev => {
                        const b64 = ev.target.result;
                        ImageStore.set(c.id, b64);
                        const updated = clothes.map(x => x.id===c.id ? {...x, image:b64, hasImage:true} : x);
                        saveClothes(updated);
                      };
                      reader.readAsDataURL(e.target.files[0]);
                    }}/>
                  </div>
                  {(c.color || c.size) && <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:4 }}>
                    {c.color && <span style={{ fontSize:10, padding:'2px 8px', borderRadius:99, background:S.bg, border:'1px solid '+S.border, color:S.text, fontWeight:500 }}>{c.color}</span>}
                    {c.size && <span style={{ fontSize:10, padding:'2px 8px', borderRadius:99, background:'#E6F1FB', border:'1px solid #85B7EB', color:'#0C447C', fontWeight:600 }}>{c.size}</span>}
                  </div>}
                  <div style={{ fontSize:11, fontWeight:600, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', lineHeight:1.4, marginBottom:4 }}>{c.name}</div>
                  <div style={{ fontSize:10, color:S.sub, marginTop:'auto', display:'flex', flexDirection:'column', gap:1 }}>
                    {c.brand && <div style={{ color:S.sub, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.brand}</div>}
                    {c.price && <div style={{ color:S.accent, fontWeight:600 }}>{c.price}</div>}
                    <div style={{ color:S.hint }}>{c.category}{c.category==='액세서리'?(c.season?' · '+c.season:''):(` · ${c.temp_min}~${c.temp_max}°C`)}</div>
                    {c.purchase_date && <div style={{ color:S.hint }}>구매 {c.purchase_date.replace(/-/g,'.')}</div>}
                    {c.added_at && <div style={{ color:S.hint, fontSize:9 }}>등록 {new Date(c.added_at).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).replace(/\. /g,'.').replace(' ',' ')}</div>}
                    {c.last_worn && <div style={{ color:'#85B7EB', fontSize:9 }}>착용 {c.last_worn.replace(/-/g,'.')}</div>}
                    {c.source_url && <a href={c.source_url} onClick={e=>e.stopPropagation()} target="_blank" rel="noopener noreferrer" style={{ color:'#85B7EB', fontSize:9, textDecoration:'none', display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>🔗 원본 링크</a>}
                    <div style={{ color:'#EF9F27', marginTop:1 }}>{'★'.repeat(c.preference||3)}{'☆'.repeat(5-(c.preference||3))}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 설정 탭 ── */}
      {tab==='settings' && (
        <div style={{ padding:'20px 32px', maxWidth:1200, margin:'0 auto' }}>
          <div style={{ fontSize:18, fontWeight:700, marginBottom:16 }}>설정</div>
          <div style={card}>
            <div style={{ fontSize:12, fontWeight:500, color:S.sub, marginBottom:12 }}>내 정보</div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderBottom:`1px solid ${S.border}` }}>
              <div style={{ fontSize:14 }}>집 지역<span style={{ fontSize:12, color:S.sub, display:'block', marginTop:2 }}>날씨 조회 기준</span></div>
              <input type="text" value={settings.home_city||''} onChange={e=>setSettings(s=>({...s,home_city:e.target.value}))} placeholder="예: 성남시" style={{ border:`1px solid ${S.border}`, borderRadius:S.radiusSm, padding:'8px 12px', fontSize:13, fontFamily:'inherit', background:S.bg, color:S.text, width:150, outline:'none' }}/>
            </div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0' }}>
              <div style={{ fontSize:14 }}>추위 민감도<span style={{ fontSize:12, color:S.sub, display:'block', marginTop:2 }}>체감온도 보정</span></div>
              <select value={settings.cold_sensitivity||0} onChange={e=>setSettings(s=>({...s,cold_sensitivity:parseInt(e.target.value)}))} style={{ border:`1px solid ${S.border}`, borderRadius:S.radiusSm, padding:'8px 10px', fontSize:12, fontFamily:'inherit', background:S.surface, color:S.text, outline:'none' }}>
                <option value={-3}>추위 많이 탐</option><option value={-1}>약간 추위 탐</option><option value={0}>보통</option><option value={1}>더위 탐</option><option value={3}>더위 많이 탐</option>
              </select>
            </div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderTop:`1px solid ${S.border}`, marginTop:4 }}>
              <div style={{ fontSize:14 }}>레이어링 스타일
                <span style={{ fontSize:12, color:S.sub, display:'block', marginTop:2 }}>셔츠 안에 이너 착용 여부</span>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                {[['inner','이너 있음'],['no_inner','이너 없음'],['auto','자유롭게']].map(([v,l])=>(
                  <button key={v} onClick={()=>setSettings(s=>({...s,layering:v}))} style={{ padding:'6px 10px', borderRadius:8, fontSize:11, fontWeight:500, border:`1px solid ${settings.layering===v?S.accent:S.border}`, background:settings.layering===v?S.accent:S.surface, color:settings.layering===v?'#fff':S.sub, cursor:'pointer', fontFamily:'inherit' }}>{l}</button>
                ))}
              </div>
            </div>
            <button onClick={saveSettings} style={btnPrimary({ width:'100%', marginTop:12 })}>저장</button>
          </div>
          <div style={card}>
            <div style={{ fontSize:12, fontWeight:500, color:S.sub, marginBottom:12 }}>데이터</div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingBottom:12, borderBottom:`1px solid ${S.border}`, marginBottom:12 }}>
              <div style={{ fontSize:14 }}>등록된 옷<span style={{ fontSize:12, color:S.sub, display:'block', marginTop:2 }}>{clothes.length}개</span></div>
              <button onClick={()=>showConfirm('모든 옷 데이터를 초기화할까요?', ()=>{ clothes.forEach(c=>ImageStore.del(c.id)); setClothes([]); LS.set('clothes',[]); setConfirm(null); })} style={{ ...btn({ padding:'6px 12px', fontSize:12, color:S.danger, borderColor:S.danger }) }}>초기화</button>
            </div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontSize:14 }}>이미지 복구
                <span style={{ fontSize:12, color:S.sub, display:'block', marginTop:2 }}>
                  source_url 있는 옷 {clothes.filter(c=>c.source_url&&!ImageStore.get(c.id)).length}개 복구 가능
                </span>
              </div>
              <button onClick={restoreAllImages} disabled={!!restoreProgress && restoreProgress.done < restoreProgress.total} style={{ ...btnPrimary({ padding:'6px 12px', fontSize:12 }), opacity: restoreProgress && restoreProgress.done < restoreProgress.total ? 0.6 : 1 }}>
                {restoreProgress && restoreProgress.done < restoreProgress.total ? `복구 중 ${restoreProgress.done}/${restoreProgress.total}` : '이미지 일괄 복구'}
              </button>
            </div>
            {restoreProgress && (
              <div style={{ marginTop:10, padding:'8px 12px', background:S.bg, borderRadius:8, fontSize:12, color:S.sub }}>
                {restoreProgress.log}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 옷 추가 모달 ── */}
      {mounted && modalOpen && createPortal(
        <div onClick={e=>{ if(e.target!==e.currentTarget) return; const anyLoading = orderLoading||urlLoading||batchLoading||analyzeLoading||Object.values(orderUrlLoading).some(Boolean); if(anyLoading){ showToast('분석 중에는 닫을 수 없어요'); return; } setModalOpen(false); }} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:'20px 20px 0 0', padding:20, width:'100%', maxWidth:480, height:'85vh', overflowY:'auto' }}>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:16 }}>
              {editingId ? '옷 수정' : pendingItems.length>0 ? `옷 추가 (${(resultTags?.setCount||pendingItems.length+1)-pendingItems.length}/${resultTags?.setCount||pendingItems.length+1})` : '옷 추가'}
            </div>
            {/* 탭 */}
            <div style={{ display:'flex', gap:4, marginBottom:14 }}>
              {[['url','🔗 쇼핑몰 URL'],['order','🧾 주문 내역'],['photo','📷 사진 업로드']].map(([t,l])=>(
                <button key={t} onClick={()=>setAddTab(t)} style={{ flex:1, padding:'8px 4px', borderRadius:S.radiusSm, fontSize:12, fontWeight:500, border:`1px solid ${S.border}`, background:addTab===t?S.accent:S.bg, color:addTab===t?'#fff':S.sub, cursor:'pointer', fontFamily:'inherit' }}>{l}</button>
              ))}
            </div>

            {/* URL 탭 */}
            {addTab==='url' && (
              <div>
                <div style={{ display:'flex', gap:4, marginBottom:10 }}>
                  <button onClick={()=>setBatchMode(false)} style={{ flex:1, padding:'7px 0', borderRadius:8, fontSize:12, fontWeight:500, border:`1px solid ${!batchMode?S.accent:S.border}`, background:!batchMode?S.accent:S.surface, color:!batchMode?'#fff':S.sub, cursor:'pointer', fontFamily:'inherit' }}>단일 URL</button>
                  <button onClick={()=>setBatchMode(true)}  style={{ flex:1, padding:'7px 0', borderRadius:8, fontSize:12, fontWeight:500, border:`1px solid ${batchMode?S.accent:S.border}`,  background:batchMode?S.accent:S.surface,  color:batchMode?'#fff':S.sub,  cursor:'pointer', fontFamily:'inherit' }}>여러 URL</button>
                </div>
                {batchMode ? (
                  <div>
                    <textarea
                      value={batchUrls}
                      onChange={e=>setBatchUrls(e.target.value)}
                      placeholder={'URL을 한 줄에 하나씩\nhttps://www.musinsa.com/products/123\nhttps://www.musinsa.com/products/456'}
                      style={{ width:'100%', height:90, border:`1px solid ${S.border}`, borderRadius:S.radiusSm, padding:'9px 12px', fontSize:12, fontFamily:'inherit', outline:'none', resize:'none', boxSizing:'border-box', marginBottom:8 }}
                    />
                    <button onClick={fetchBatch} disabled={batchLoading} style={btnPrimary({ width:'100%' })}>{batchLoading?'파싱 중...':'한꺼번에 가져오기'}</button>
                    {batchItems.length>0 && (
                      <div style={{ marginTop:12 }}>
                        <div style={{ fontSize:12, color:S.sub, marginBottom:8 }}>{batchItems.length}개 파싱됨 — 확인 후 저장</div>
                        {batchItems.map((item,idx)=>(
                          <div key={item.id} style={{ border:`1px solid ${item.checked?S.accent:S.border}`, borderRadius:10, padding:'10px 12px', marginBottom:8 }}>
                            <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                              {item.image && <img src={item.image} style={{ width:52, height:52, objectFit:'cover', borderRadius:8, flexShrink:0 }} alt=""/>}
                              <div style={{ flex:1, minWidth:0 }}>
                                <input value={item.name} onChange={e=>setBatchItems(b=>b.map((x,i)=>i===idx?{...x,name:e.target.value}:x))} style={{ width:'100%', border:`1px solid ${S.border}`, borderRadius:6, padding:'5px 8px', fontSize:12, fontFamily:'inherit', outline:'none', marginBottom:4, boxSizing:'border-box' }} placeholder="상품명"/>
                                <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                                  <input value={item.brand} onChange={e=>setBatchItems(b=>b.map((x,i)=>i===idx?{...x,brand:e.target.value}:x))} style={{ width:90, border:`1px solid ${S.border}`, borderRadius:6, padding:'4px 7px', fontSize:11, fontFamily:'inherit', outline:'none' }} placeholder="브랜드"/>
                                  <select value={item.category} onChange={e=>setBatchItems(b=>b.map((x,i)=>i===idx?{...x,category:e.target.value}:x))} style={{ border:`1px solid ${S.border}`, borderRadius:6, padding:'4px 6px', fontSize:11, fontFamily:'inherit', outline:'none' }}>
                                    {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                                  </select>
                                  {item.colors&&item.colors.length>1 ? (
                                    <select value={item.color} onChange={e=>setBatchItems(b=>b.map((x,i)=>i===idx?{...x,color:e.target.value}:x))} style={{ border:`1.5px solid #85B7EB`, borderRadius:6, padding:'4px 6px', fontSize:11, fontFamily:'inherit', outline:'none', background:'#E6F1FB', color:'#0C447C' }}>
                                      <option value="">색상 선택</option>
                                      {item.colors.map(c=><option key={c} value={c}>{c}</option>)}
                                    </select>
                                  ) : (
                                    <input value={item.color} onChange={e=>setBatchItems(b=>b.map((x,i)=>i===idx?{...x,color:e.target.value}:x))} style={{ width:70, border:`1px solid ${S.border}`, borderRadius:6, padding:'4px 7px', fontSize:11, fontFamily:'inherit', outline:'none' }} placeholder="색상"/>
                                  )}
                                  <input value={item.price} onChange={e=>setBatchItems(b=>b.map((x,i)=>i===idx?{...x,price:e.target.value}:x))} style={{ width:80, border:`1px solid ${S.border}`, borderRadius:6, padding:'4px 7px', fontSize:11, fontFamily:'inherit', outline:'none' }} placeholder="가격"/>
                                </div>
                                <div style={{ display:'flex', gap:4, marginTop:4, alignItems:'center' }}>
                                  <input value={item.temp_min} onChange={e=>setBatchItems(b=>b.map((x,i)=>i===idx?{...x,temp_min:e.target.value}:x))} style={{ width:46, border:`1px solid ${S.border}`, borderRadius:6, padding:'4px 7px', fontSize:11, fontFamily:'inherit', outline:'none' }} placeholder="최저"/>
                                  <span style={{ fontSize:11, color:S.sub }}>~</span>
                                  <input value={item.temp_max} onChange={e=>setBatchItems(b=>b.map((x,i)=>i===idx?{...x,temp_max:e.target.value}:x))} style={{ width:46, border:`1px solid ${S.border}`, borderRadius:6, padding:'4px 7px', fontSize:11, fontFamily:'inherit', outline:'none' }} placeholder="최고"/>
                                  <span style={{ fontSize:11, color:S.sub }}>°C</span>
                                </div>
                              </div>
                              <button onClick={()=>setBatchItems(b=>b.map((x,i)=>i===idx?{...x,checked:!x.checked}:x))} style={{ width:24, height:24, borderRadius:6, border:`1.5px solid ${item.checked?S.accent:S.border}`, background:item.checked?S.accent:'#fff', color:'#fff', fontSize:14, cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>{item.checked?'✓':''}</button>
                            </div>
                          </div>
                        ))}
                        <button onClick={saveBatchItems} style={btnPrimary({ width:'100%', marginTop:4 })}>선택 항목 저장 ({batchItems.filter(i=>i.checked).length}개)</button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                      <input value={shopUrl} onChange={e=>setShopUrl(e.target.value)} placeholder="무신사, 29CM 등 상품 URL" style={{ flex:1, border:`1px solid ${S.border}`, borderRadius:S.radiusSm, padding:'9px 12px', fontSize:13, fontFamily:'inherit', outline:'none' }}/>
                      <button onClick={fetchFromUrl} disabled={urlLoading} style={btnPrimary({ flexShrink:0 })}>{urlLoading?'...':'가져오기'}</button>
                    </div>
                    {fetchedImage && (
                      <div style={{ marginBottom:10 }}>
                        <img src={fetchedImage} style={{ width:80, height:80, objectFit:'cover', borderRadius:8, display:'block', marginBottom:6 }} alt=""/>
                        <div style={{ display:'flex', gap:6 }}>
                          <button onClick={()=>document.getElementById('replaceImg').click()} style={{ padding:'5px 10px', borderRadius:8, fontSize:11, fontWeight:500, border:'1px solid #E8E6E0', background:'#fff', cursor:'pointer', fontFamily:'inherit' }}>🔄 이미지 교체</button>
                          <button onClick={()=>removeBackground(fetchedImage)} disabled={removingBg} style={{ padding:'5px 10px', borderRadius:8, fontSize:11, fontWeight:500, border:'1px solid #85B7EB', background:'#E6F1FB', color:'#0C447C', cursor:'pointer', fontFamily:'inherit' }}>{removingBg?'처리 중...':'✂️ 누끼따기'}</button>
                        </div>
                        <input id="replaceImg" type="file" accept="image/*" style={{ display:'none' }} onChange={e=>{
                          if(!e.target.files[0]) return;
                          const reader = new FileReader();
                          reader.onload = ev => { setFetchedImage(ev.target.result); setImageBase64(ev.target.result.split(',')[1]); setImageType(e.target.files[0].type); };
                          reader.readAsDataURL(e.target.files[0]);
                        }}/>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 사진 탭 */}
            {addTab==='photo' && (
              <div onClick={()=>document.getElementById('photoInput').click()} style={{ border:`1.5px dashed ${S.border}`, borderRadius:S.radiusSm, padding:24, textAlign:'center', cursor:'pointer', background:S.bg, marginBottom:10 }}>
                <div style={{ fontSize:24, marginBottom:6, color:S.sub }}>📷</div>
                <div style={{ fontSize:13, color:S.sub }}>사진 업로드하면 AI가 자동 분류해요</div>
                <input id="photoInput" type="file" accept="image/*" style={{ display:'none' }} onChange={e=>e.target.files[0]&&handlePhoto(e.target.files[0])}/>
                {analyzeLoading && <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginTop:10 }}><div style={{ width:20, height:20, border:`2px solid ${S.border}`, borderTopColor:S.accent, borderRadius:'50%', animation:'spin 0.7s linear infinite' }}></div><span style={{ fontSize:13 }}>분석 중...</span></div>}
              </div>
            )}

            {/* 주문내역 탭 */}
            {addTab==='order' && (
              <div>
                <div onClick={()=>document.getElementById('orderInput').click()} style={{ border:`1.5px dashed ${S.border}`, borderRadius:S.radiusSm, padding:20, textAlign:'center', cursor:'pointer', background:S.bg, marginBottom:10 }}>
                  <div style={{ fontSize:24, marginBottom:6 }}>🧾</div>
                  <div style={{ fontSize:13, color:S.sub }}>무신사 주문 내역 스크린샷을 업로드하세요</div>
                  <div style={{ fontSize:11, color:S.hint, marginTop:4 }}>색상·가격·구매일자 자동 인식</div>
                  <div style={{ fontSize:11, color:'#85B7EB', marginTop:6 }}>여러 장 동시 선택 가능</div>
                  <input id="orderInput" type="file" accept="image/*" multiple style={{ display:'none' }} onChange={e=>e.target.files.length>0&&parseOrderImage(e.target.files)}/>
                  {orderLoading && <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginTop:10 }}><div style={{ width:20, height:20, border:`2px solid ${S.border}`, borderTopColor:S.accent, borderRadius:'50%', animation:'spin 0.7s linear infinite' }}></div><span style={{ fontSize:13 }}>스크린샷 분석 중...</span></div>}
                </div>
                {orderItems.length>0 && (
                  <div>
                    <div style={{ fontSize:12, color:S.sub, marginBottom:8 }}>{orderItems.length}개 상품 인식됨</div>
                    {orderItems.map((item,idx)=>(
                      <div key={item.id} style={{ border:`1.5px solid ${item.checked?S.accent:S.border}`, borderRadius:10, padding:'10px 12px', marginBottom:8 }}>
                        {/* 상단: 이미지 + 인풋들 + 체크박스 */}
                        <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                          {/* 이미지 영역 - 항상 고정 크기 */}
                          <div style={{ width:52, height:52, borderRadius:6, flexShrink:0, border:`1px solid ${S.border}`, overflow:'hidden', background:S.bg, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', position:'relative' }}>
                            {item.image ? (
                              <img src={item.image} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt=""/>
                            ) : (
                              <>
                                <div style={{ fontSize:16 }}>{CAT_EMOJI[item.category]||'👔'}</div>
                                {item.color && <div style={{ fontSize:8, color:S.sub, textAlign:'center', padding:'0 2px', lineHeight:1.2, marginTop:2, maxWidth:'100%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.color}</div>}
                              </>
                            )}
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <input value={item.name} onChange={e=>setOrderItems(o=>o.map((b,i)=>i===idx?{...b,name:e.target.value}:b))} style={{ width:'100%', border:`1px solid ${S.border}`, borderRadius:6, padding:'5px 8px', fontSize:12, fontFamily:'inherit', outline:'none', marginBottom:6, boxSizing:'border-box', fontWeight:500 }} placeholder="상품명"/>
                            {/* 행1: 색상 + 사이즈 - 가장 중요, 크게 */}
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 80px', gap:4, marginBottom:4 }}>
                              <div>
                                <div style={{ fontSize:9, color:S.hint, marginBottom:2 }}>색상</div>
                                <input value={item.color} onChange={e=>setOrderItems(o=>o.map((b,i)=>i===idx?{...b,color:e.target.value}:b))} style={{ width:'100%', border:`1px solid ${S.border}`, borderRadius:6, padding:'5px 8px', fontSize:12, fontFamily:'inherit', outline:'none', background:S.surface, boxSizing:'border-box' }} placeholder="예: 블랙, 화이트오트밀"/>
                              </div>
                              <div>
                                <div style={{ fontSize:9, color:S.hint, marginBottom:2 }}>사이즈</div>
                                <input value={item.size||''} onChange={e=>setOrderItems(o=>o.map((b,i)=>i===idx?{...b,size:e.target.value}:b))} style={{ width:'100%', border:`1px solid ${S.border}`, borderRadius:6, padding:'5px 8px', fontSize:12, fontFamily:'inherit', outline:'none', background:S.surface, boxSizing:'border-box' }} placeholder="M, L, 95"/>
                              </div>
                            </div>
                            {/* 행1.5: 소재 + 계절 */}
                            <div style={{ display:'flex', gap:4, marginBottom:4 }}>
                              <input value={item.material||''} onChange={e=>setOrderItems(o=>o.map((b,i)=>i===idx?{...b,material:e.target.value}:b))} style={{ flex:1, border:`1px solid ${S.border}`, borderRadius:6, padding:'4px 7px', fontSize:11, fontFamily:'inherit', outline:'none' }} placeholder="소재 (예: 면, 폴리에스터)"/>
                              <input value={item.season||''} onChange={e=>setOrderItems(o=>o.map((b,i)=>i===idx?{...b,season:e.target.value}:b))} style={{ width:70, border:`1px solid ${S.border}`, borderRadius:6, padding:'4px 7px', fontSize:11, fontFamily:'inherit', outline:'none' }} placeholder="계절"/>
                            </div>
                            {/* 행2: 브랜드 + 가격 + 카테고리 */}
                            <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:4 }}>
                              <input value={item.brand} onChange={e=>setOrderItems(o=>o.map((b,i)=>i===idx?{...b,brand:e.target.value}:b))} style={{ flex:1, minWidth:70, border:`1px solid ${S.border}`, borderRadius:6, padding:'4px 7px', fontSize:11, fontFamily:'inherit', outline:'none' }} placeholder="브랜드"/>
                              <input value={item.price} onChange={e=>setOrderItems(o=>o.map((b,i)=>i===idx?{...b,price:e.target.value}:b))} style={{ width:80, border:`1px solid ${S.border}`, borderRadius:6, padding:'4px 7px', fontSize:11, fontFamily:'inherit', outline:'none' }} placeholder="가격"/>
                              <select value={item.category} onChange={e=>setOrderItems(o=>o.map((b,i)=>i===idx?{...b,category:e.target.value}:b))} style={{ border:`1px solid ${S.border}`, borderRadius:6, padding:'4px 6px', fontSize:11, fontFamily:'inherit', outline:'none' }}>
                                {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                            {/* 행3: 구매일자 + 온도 */}
                            <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                              <input value={item.purchase_date} onChange={e=>setOrderItems(o=>o.map((b,i)=>i===idx?{...b,purchase_date:e.target.value}:b))} style={{ width:100, border:`1px solid ${S.border}`, borderRadius:6, padding:'4px 7px', fontSize:11, fontFamily:'inherit', outline:'none' }} placeholder="구매일자"/>
                              <span style={{ fontSize:10, color:S.hint }}>온도</span>
                              <input value={item.temp_min} onChange={e=>setOrderItems(o=>o.map((b,i)=>i===idx?{...b,temp_min:e.target.value}:b))} style={{ width:36, border:`1px solid ${S.border}`, borderRadius:6, padding:'4px 5px', fontSize:11, fontFamily:'inherit', outline:'none', textAlign:'center' }} placeholder="최저"/>
                              <span style={{ fontSize:11, color:S.sub }}>~</span>
                              <input value={item.temp_max} onChange={e=>setOrderItems(o=>o.map((b,i)=>i===idx?{...b,temp_max:e.target.value}:b))} style={{ width:36, border:`1px solid ${S.border}`, borderRadius:6, padding:'4px 5px', fontSize:11, fontFamily:'inherit', outline:'none', textAlign:'center' }} placeholder="최고"/>
                              <span style={{ fontSize:10, color:S.sub }}>°C</span>
                            </div>
                          </div>
                          <button onClick={()=>setOrderItems(o=>o.map((b,i)=>i===idx?{...b,checked:!b.checked}:b))} style={{ width:24, height:24, borderRadius:6, border:`1.5px solid ${item.checked?S.accent:S.border}`, background:item.checked?S.accent:'#fff', color:'#fff', fontSize:14, cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>{item.checked?'✓':''}</button>
                        </div>
                        {/* URL 보강 영역 */}
                        <div style={{ marginTop:8, paddingTop:8, borderTop:`1px solid ${S.border}` }}>
                          <div style={{ display:'flex', gap:6, alignItems:'center', marginBottom: (item.style||item.material) ? 6 : 0 }}>
                            <input
                              value={orderUrlMap[item.id]||''}
                              onChange={e=>setOrderUrlMap(m=>({...m,[item.id]:e.target.value}))}
                              placeholder="무신사 상품 URL → 이미지·스타일·소재 자동 보강"
                              style={{ flex:1, border:`1px solid ${S.border}`, borderRadius:6, padding:'5px 8px', fontSize:11, fontFamily:'inherit', outline:'none', color:S.text, minWidth:0 }}
                            />
                            <button
                              onClick={()=>enrichItemWithUrl(item.id, orderUrlMap[item.id])}
                              disabled={orderUrlLoading[item.id] || !orderUrlMap[item.id]}
                              style={{ padding:'5px 10px', borderRadius:6, fontSize:11, fontWeight:600, border:`1px solid #85B7EB`, background:orderUrlMap[item.id]?'#0C447C':'#E6F1FB', color:orderUrlMap[item.id]?'#fff':'#B5D4F4', cursor:'pointer', fontFamily:'inherit', flexShrink:0, whiteSpace:'nowrap', opacity:!orderUrlMap[item.id]?0.5:1 }}
                            >{orderUrlLoading[item.id]?'⏳ 분석중..':'🔗 보강'}</button>
                          </div>
                          {/* 보강 결과 */}
                          {item.enriched && (
                            <div style={{ background:'#F0F7FF', borderRadius:6, padding:'6px 8px', marginTop:4 }}>
                              <div style={{ fontSize:10, color:'#0C447C', fontWeight:600, marginBottom:4 }}>✓ 보강 완료</div>
                              <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>
                                {item.image && <span style={{ fontSize:10, padding:'2px 8px', borderRadius:99, background:'#E1F5EE', color:'#085041' }}>이미지</span>}
                                {item.style && item.style.split(',').map(s=>s.trim()).filter(Boolean).map(s=>(
                                  <span key={s} style={{ fontSize:10, padding:'2px 8px', borderRadius:99, background:'#E6F1FB', color:'#0C447C' }}>{s}</span>
                                ))}
                                {item.material && item.material.split(',').map(s=>s.trim()).filter(Boolean).map(s=>(
                                  <span key={s} style={{ fontSize:10, padding:'2px 8px', borderRadius:99, background:'#FAEEDA', color:'#633806' }}>{s}</span>
                                ))}
                                {item.season && <span style={{ fontSize:10, padding:'2px 8px', borderRadius:99, background:'#EAF3DE', color:'#27500A' }}>{item.season}</span>}
                                {!item.style && !item.material && !item.season && !item.image && <span style={{ fontSize:10, color:'#888' }}>추가 정보 없음</span>}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    <button onClick={saveOrderItems} style={btnPrimary({ width:'100%', marginTop:4 })}>선택 항목 저장 ({orderItems.filter(i=>i.checked).length}개)</button>
                  </div>
                )}
              </div>
            )}

            {/* 분석 태그 - URL/사진 탭에서만 표시 */}
            {resultTags && addTab!=='order' && (
              <div style={{ padding:'10px 12px', background:S.bg, borderRadius:S.radiusSm, margin:'10px 0' }}>
                <div style={{ fontSize:11, color:S.sub, marginBottom:6 }}>{resultTags.brand&&<strong>{resultTags.brand}</strong>}{resultTags.price&&` · ${resultTags.price}`}</div>
                {(resultTags.colors||[]).map(t=><span key={t} style={{ display:'inline-block', padding:'3px 9px', borderRadius:99, fontSize:11, fontWeight:500, margin:2, background:'#E1F5EE', color:'#085041' }}>{t}</span>)}
                {(resultTags.material||[]).map(t=><span key={t} style={{ display:'inline-block', padding:'3px 9px', borderRadius:99, fontSize:11, fontWeight:500, margin:2, background:'#FAEEDA', color:'#633806' }}>{t}</span>)}
                {(resultTags.style||[]).map(t=><span key={t} style={{ display:'inline-block', padding:'3px 9px', borderRadius:99, fontSize:11, fontWeight:500, margin:2, background:'#E6F1FB', color:'#0C447C' }}>{t}</span>)}
                {(resultTags.temp_min||resultTags.temp_max)&&<span style={{ display:'inline-block', padding:'3px 9px', borderRadius:99, fontSize:11, fontWeight:500, margin:2, background:'#EEEDFE', color:'#3C3489' }}>{resultTags.temp_min||'?'}~{resultTags.temp_max||'?'}°C</span>}
                {resultTags.isSet&&<div style={{ marginTop:6, fontSize:11, color:'#0C447C', background:'#E6F1FB', padding:'5px 10px', borderRadius:8 }}>👔 세트 상품 {resultTags.setCount}개 감지 — 저장하면 다음 아이템으로 자동 이동해요</div>}
              </div>
            )}

            {/* 폼 - URL/사진 탭에서만 표시 */}
            {addTab!=='order' && <div style={{ marginTop:12 }}>
              {[{l:'옷 이름',k:'name',p:'예: 그레이 가디건'},{l:'스타일',k:'style',p:'예: 미니멀, 캐주얼'},{l:'색상',k:'color',p:'예: 라이트 그레이'}].map(({l,k,p})=>(
                <div key={k} style={formRow}>
                  <div style={labelSt}>{l}</div>
                  <input value={clothForm[k]||''} onChange={e=>setClothForm(f=>({...f,[k]:e.target.value}))} placeholder={p} style={inputSt()}/>
                </div>
              ))}
              <div style={formRow}>
                <div style={labelSt}>사이즈</div>
                <input value={clothForm.size||''} onChange={e=>setClothForm(f=>({...f,size:e.target.value}))} placeholder="예: M, L, 95, Free" style={inputSt()}/>
              </div>
              {colorOptions.length>0 && (
                <div style={{ marginBottom:12, padding:'10px 12px', background:'#E6F1FB', borderRadius:10 }}>
                  <div style={{ fontSize:12, color:'#0C447C', fontWeight:500, marginBottom:8 }}>구매할 색상을 선택해주세요</div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {colorOptions.map(c=>(
                      <button key={c} onClick={()=>{setClothForm(f=>({...f,color:c}));setColorOptions([]);}} style={{ padding:'5px 12px', borderRadius:99, fontSize:12, fontWeight:500, border:`1px solid ${clothForm.color===c?'#0C447C':'#B5D4F4'}`, background:clothForm.color===c?'#0C447C':'#fff', color:clothForm.color===c?'#fff':'#0C447C', cursor:'pointer', fontFamily:'inherit' }}>{c}</button>
                    ))}
                  </div>
                </div>
              )}
              <div style={formRow}>
                <div style={labelSt}>브랜드</div>
                <input value={clothForm.brand||''} onChange={e=>setClothForm(f=>({...f,brand:e.target.value}))} placeholder="예: 무신사 스탠다드" list="brand-list" style={inputSt()} autoComplete="off"/>
                <datalist id="brand-list">{[...new Set(clothes.map(c=>c.brand).filter(Boolean))].map(b=><option key={b} value={b}/>)}</datalist>
              </div>
              <div style={formRow}>
                <div style={labelSt}>가격</div>
                <input value={clothForm.price||''} onChange={e=>setClothForm(f=>({...f,price:e.target.value}))} placeholder="예: 45,000원" style={inputSt()}/>
              </div>
              <div style={formRow}>
                <div style={labelSt}>카테고리</div>
                <select value={clothForm.category} onChange={e=>{
                  const cat=e.target.value;
                  setClothForm(f=>({ ...f, category:cat, ...(cat==='액세서리'?{temp_min:'-99',temp_max:'99',season:'사계절'}:{season:''}) }));
                }} style={inputSt()}>
                  {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {clothForm.category==='액세서리' && (
                <div style={formRow}>
                  <div style={labelSt}>시즌</div>
                  <div style={{ display:'flex', gap:6, marginTop:4 }}>
                    {[['사계절','-99','99'],['봄/가을','10','22'],['여름','23','35'],['겨울','-15','12']].map(([s,mn,mx])=>(
                      <button key={s} onClick={()=>setClothForm(f=>({...f,season:s,temp_min:mn,temp_max:mx}))} style={{ flex:1, padding:'6px 0', borderRadius:8, fontSize:11, fontWeight:500, border:`1px solid ${clothForm.season===s?S.accent:S.border}`, background:clothForm.season===s?S.accent:S.surface, color:clothForm.season===s?'#fff':S.sub, cursor:'pointer', fontFamily:'inherit' }}>{s}</button>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {[{l:'최저 온도 (°C)',k:'temp_min',p:'10'},{l:'최고 온도 (°C)',k:'temp_max',p:'18'}].map(({l,k,p})=>(
                  <div key={k} style={formRow}>
                    <div style={labelSt}>{l}</div>
                    <input value={clothForm[k]||''} onChange={e=>setClothForm(f=>({...f,[k]:e.target.value}))} placeholder={p} style={inputSt()}/>
                  </div>
                ))}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <div style={formRow}>
                  <div style={labelSt}>구매 일자</div>
                  <input type="date" value={clothForm.purchase_date||''} onChange={e=>setClothForm(f=>({...f,purchase_date:e.target.value}))} style={inputSt()}/>
                </div>
                <div style={formRow}>
                  <div style={labelSt}>선호도</div>
                  <div style={{ display:'flex', gap:4, marginTop:4 }}>
                    {[1,2,3,4,5].map(n=>(
                      <button key={n} onClick={()=>setClothForm(f=>({...f,preference:n}))} style={{ flex:1, padding:'7px 0', borderRadius:8, fontSize:16, border:`1px solid ${clothForm.preference>=n?'#EF9F27':'#E8E6E0'}`, background:clothForm.preference>=n?'#FAEEDA':'#fff', cursor:'pointer', lineHeight:1 }}>★</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>}
            {addTab!=='order' && (
            <div style={{ display:'flex', gap:8, marginTop:16 }}>
              <button onClick={()=>{ const anyLoading = orderLoading||urlLoading||batchLoading||analyzeLoading||Object.values(orderUrlLoading).some(Boolean); if(anyLoading){ showToast('분석 중에는 닫을 수 없어요'); return; } setModalOpen(false); }} style={btn({ flex:1 })}>취소</button>
              <button onClick={saveCloth} style={btnPrimary({ flex:1 })}>{editingId?'수정 완료':'저장'}</button>
            </div>
            )}
            {addTab==='order' && (
            <div style={{ marginTop:8 }}>
              <button onClick={()=>{ const anyLoading = orderLoading||urlLoading||batchLoading||analyzeLoading||Object.values(orderUrlLoading).some(Boolean); if(anyLoading){ showToast('분석 중에는 닫을 수 없어요'); return; } setModalOpen(false); }} style={btn({ width:'100%' })}>닫기</button>
            </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* 옷 추가 FAB */}
      {mounted && tab==='closet' && createPortal(
        <button onClick={()=>{setSelectMode(false);setSelectedIds(new Set());resetModal();setModalOpen(true);}} style={{ position:'fixed', bottom:28, left:'50%', transform:'translateX(-50%)', background:S.accent, color:'#fff', border:'none', borderRadius:99, padding:'15px 0', fontSize:15, fontWeight:700, fontFamily:'inherit', cursor:'pointer', boxShadow:'0 6px 24px rgba(0,0,0,0.25)', zIndex:200, whiteSpace:'nowrap', width:'calc(100% - 80px)', maxWidth:400, display:'block', textAlign:'center' }}>＋ 옷 추가하기</button>,
        document.body
      )}

      {/* 토스트 */}
      {mounted && toast && createPortal(
        <div style={{ position:'fixed', bottom:90, left:'50%', transform:'translateX(-50%)', background:S.accent, color:'#fff', padding:'10px 20px', borderRadius:99, fontSize:13, zIndex:9999, whiteSpace:'nowrap' }}>{toast}</div>,
        document.body
      )}

      {/* 커스텀 Confirm */}
      {mounted && confirm && (
        <ConfirmModal
          message={confirm.message}
          onConfirm={confirm.onConfirm}
          onCancel={()=>setConfirm(null)}
        />
      )}
    </>
  );
}
