import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Head from 'next/head';

const LS = {
  get: (k, d=null) => { try { const v=localStorage.getItem(k); return v?JSON.parse(v):d; } catch{return d;} },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch{} },
};

const S = {
  bg: '#F7F6F2', surface: '#fff', border: '#E8E6E0',
  text: '#1A1A18', sub: '#888780', hint: '#B4B2A9', accent: '#2C2C2A',
  radius: 16, radiusSm: 10,
};

const INDOOR_TEMPS = { '오피스':22, '카페':21, '백화점/쇼핑몰':20, '식당':21, '대중교통':22, '기타 실내':21 };
const CAT_EMOJI = { '아우터':'🧥', '상의':'👕', '하의':'👖', '원피스':'👗', '신발':'👟', '액세서리':'👜' };
const TIME_OPTS = ['06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00'];
const TIME_LABELS = ['오전 6시','오전 7시','오전 8시','오전 9시','오전 10시','오전 11시','낮 12시','오후 1시','오후 2시','오후 3시','오후 4시','오후 5시','오후 6시','오후 7시','저녁 8시','밤 9시','밤 10시'];
const OUTDOOR_PLACES = ['실외 이동','야외 활동'];
const INDOOR_PLACES = ['오피스','카페','백화점/쇼핑몰','식당','대중교통','기타 실내'];

const btn = (extra={}) => ({ display:'inline-flex', alignItems:'center', justifyContent:'center', padding:'9px 16px', borderRadius:S.radiusSm, fontSize:13, fontWeight:500, fontFamily:'inherit', cursor:'pointer', border:`1px solid ${S.border}`, background:S.surface, color:S.text, ...extra });
const btnPrimary = (extra={}) => btn({ background:S.accent, color:'#fff', border:`1px solid ${S.accent}`, ...extra });
const input = (extra={}) => ({ width:'100%', border:`1px solid ${S.border}`, borderRadius:S.radiusSm, padding:'9px 12px', fontSize:13, fontFamily:'inherit', background:S.surface, color:S.text, outline:'none', boxSizing:'border-box', ...extra });
const card = { background:S.surface, border:`1px solid ${S.border}`, borderRadius:S.radius, padding:16, marginBottom:12 };
const formRow = { marginBottom:10 };
const label = { fontSize:12, color:S.sub, marginBottom:4 };

export default function Home() {
  const [tab, setTab] = useState('recommend');
  const [clothes, setClothes] = useState([]);
  const [schedules, setSchedules] = useState([
    { city:'', time:'08:00', env:'outdoor', place:'실외 이동', isHome:true },
    { city:'', time:'09:00', env:'indoor', place:'오피스', isHome:false },
  ]);
  const [occasion, setOccasion] = useState('비즈니스 캐주얼');
  const [weatherList, setWeatherList] = useState([]);
  const [outfits, setOutfits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [catFilter, setCatFilter] = useState('전체');
  const [modalOpen, setModalOpen] = useState(false);
  const [addTab, setAddTab] = useState('url');
  const [shopUrl, setShopUrl] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [fetchedImage, setFetchedImage] = useState('');
  const [removingBg, setRemovingBg] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [clothForm, setClothForm] = useState({ name:'', category:'상의', temp_min:'', temp_max:'', style:'', color:'', purchase_date: new Date().toISOString().split('T')[0], preference:3 });
  const [settings, setSettings] = useState({ home_city:'', cold_sensitivity:0 });
  const [toast, setToast] = useState('');
  const [imageBase64, setImageBase64] = useState(null);
  const [imageType, setImageType] = useState(null);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [resultTags, setResultTags] = useState(null);
  const [pendingItems, setPendingItems] = useState([]);
  const [colorOptions, setColorOptions] = useState([]);
  const [batchMode, setBatchMode] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderItems, setOrderItems] = useState([]);
  const [batchItems, setBatchItems] = useState([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchUrls, setBatchUrls] = useState('');
  const [mounted, setMounted] = useState(false);
  const [recommendMode, setRecommendMode] = useState('today'); // today | week
  const [weekPlan, setWeekPlan] = useState(() => {
    const days = [];
    for (let i = 0; i < 28; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const dow = d.getDay();
      days.push({
        date: d.toISOString().split('T')[0],
        city: '',
        env: 'indoor',
        place: '오피스',
        occasion: '비즈니스 캐주얼',
        active: dow !== 0 && dow !== 6 && i < 5,
      });
    }
    return days;
  });
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekOutfits, setWeekOutfits] = useState([]);
  const [weekLoading, setWeekLoading] = useState(false);
  const [packingList, setPackingList] = useState('');

  useEffect(() => {
    setMounted(true);
    setClothes(LS.get('clothes', []));
    setSettings(LS.get('settings', { home_city:'', cold_sensitivity:0 }));
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(()=>setToast(''), 2500); };

  const fetchWeather = async (city, time) => {
    const r = await fetch(`/api/weather?city=${encodeURIComponent(city)}&time=${time}`);
    if (!r.ok) throw new Error(`날씨 오류 (${city})`);
    return r.json();
  };

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
      const cats = ['아우터','상의','하의','원피스','신발'];
      const clothText = cats.map(cat => {
        const items = clothes.filter(c => c.category===cat);
        if (!items.length) return '';
        const today = new Date();
        return '['+cat+'] '+items.map(function(c){
          if (c.last_worn) {
            const worn = new Date(c.last_worn);
            const diffDays = Math.floor((today - worn) / 86400000);
            if (diffDays < 2) return c.name+'(착용불가-'+diffDays+'일전착용)';
          }
          return c.name+'('+c.temp_min+'~'+c.temp_max+'C)';
        }).join(', ');
      }).filter(Boolean).join('\n');
      const weatherText = wList.map(w => `- ${w.time} [${w.isIndoor?'실내':'실외'}] ${w.city}: ${w.temp}°C`).join('\n');
      const minTemp = Math.min(...wList.filter(w=>!w.isIndoor).map(w=>w.feels_like).filter(Boolean));
      const hasRain = wList.some(w=>!w.isIndoor && w.chance_of_rain>30);
      const r = await fetch('/api/claude', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          model:'claude-sonnet-4-20250514', max_tokens:1000,
          system:'패션 스타일리스트. 옷장과 날씨로 최적 코디를 JSON으로만 추천. 다른 텍스트 없음.',
          messages:[{ role:'user', content:`오늘 일정:\n${weatherText}\n실외 최저체감: ${minTemp}°C\n${hasRain?'우천 가능':''}\n일정: ${occasion}\n\n옷장:\n${clothText}\n\n코디 3가지 추천. 실내 체류 많으면 이너 중요. 탈착 쉬운 아우터 우선. 선호도 높은 옷 우선 추천. (착용불가) 표시된 옷은 절대 추천하지 말 것.\n\n{"outfits":[{"outer":"이름또는null","top":"이름","bottom":"이름또는null","reason":"이유"}]}` }]
        })
      });
      const data = await r.json();
      const text = data.content?.[0]?.text?.replace(/\`\`\`json|\`\`\`/g,'').trim()||'{}';
      setOutfits(JSON.parse(text).outfits||[]);
    } catch(e) { showToast(e.message||'오류 발생'); }
    finally { setLoading(false); }
  };

  const removeBackground = async (imageUrl) => {
    setRemovingBg(true);
    try {
      const r = await fetch('/api/remove-bg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl })
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      setFetchedImage('data:image/png;base64,' + data.base64);
      setImageBase64(data.base64);
      setImageType('image/png');
    } catch(e) {
      showToast('누끼 처리 실패: ' + e.message);
    } finally {
      setRemovingBg(false);
    }
  };

  const parseOrderImage = async (file) => {
    setOrderLoading(true); setOrderItems([]);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const b64 = e.target.result.split(',')[1];
      const mt = file.type;
      try {
        const r = await fetch('/api/claude', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            model:'claude-sonnet-4-20250514', max_tokens:1500,
            system:'쇼핑몰 주문 내역 이미지 분석 전문가. JSON만 반환. 주문 내역에서 각 상품을 추출해 배열로 반환. 구매일자는 이미지에서 읽은 날짜를 YYYY-MM-DD 형식으로. 카테고리 판단: 아우터/상의/하의/원피스/신발/액세서리. 온도 기준: 반팔23~35, 긴팔17~24, 맨투맨12~20, 니트/가디건10~20, 자켓12~20, 코트-5~10, 패딩-15~5, 반바지23~35, 슬랙스10~28, 청바지5~22. {"items":[{"name":"상품명","brand":"브랜드","color":"구매한색상","price":"가격","category":"카테고리","temp_min":숫자,"temp_max":숫자,"purchase_date":"YYYY-MM-DD"}]}',
            messages:[{ role:'user', content:[
              { type:'image', source:{ type:'base64', media_type:mt, data:b64 } },
              { type:'text', text:'이 주문 내역 이미지에서 모든 상품 정보를 추출해주세요. 색상은 반드시 실제 구매한 색상(예: 엠그레이, 딥카키 등)을 써주세요.' }
            ]}]
          })
        });
        const data = await r.json();
        const text = data.content?.[0]?.text?.replace(/```json|```/g,'').trim()||'{}';
        const parsed = JSON.parse(text);
        const items = (parsed.items||[]).map(item => ({
          id: Math.random().toString(36).slice(2),
          ...item, checked: true,
          temp_min: String(item.temp_min||''), temp_max: String(item.temp_max||''),
          image: null,
        }));
        setOrderItems(items);
        if (items.length === 0) showToast('상품을 찾지 못했어요');
      } catch { showToast('분석 오류'); }
      finally { setOrderLoading(false); }
    };
    reader.readAsDataURL(file);
  };

  const saveOrderItems = () => {
    const toSave = orderItems.filter(i => i.checked && i.name);
    if (toSave.length === 0) return showToast('저장할 아이템을 선택해주세요');
    const newClothes = toSave.map(i => ({
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      name:i.name, brand:i.brand||'', price:i.price||'', color:i.color||'',
      category:i.category||'상의', temp_min:parseInt(i.temp_min)||10, temp_max:parseInt(i.temp_max)||20,
      image:null, preference:3, purchase_date:i.purchase_date||new Date().toISOString().split('T')[0],
      added_at:new Date().toISOString(),
    }));
    const updated = [...clothes, ...newClothes];
    setClothes(updated); LS.set('clothes', updated);
    setModalOpen(false); resetModal();
    showToast(newClothes.length+'개 저장됨');
  };

  const fetchBatch = async () => {
    const urls = batchUrls.split('\n').map(u => u.trim()).filter(u => u.startsWith('http'));
    if (urls.length === 0) return showToast('URL을 입력해주세요');
    if (urls.length > 10) return showToast('최대 10개까지 가능해요');
    setBatchLoading(true); setBatchItems([]);
    const results = await Promise.allSettled(urls.map(async url => {
      const r = await fetch('/api/parse-url', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ url }) });
      const p = await r.json();
      if (p.error) throw new Error(p.error);
      const items = p.items || [p];
      return items.map(item => ({
        id: Math.random().toString(36).slice(2),
        name: item.name || '',
        brand: p.brand || '',
        price: p.price || '',
        category: item.category || '상의',
        temp_min: String(item.temp_min || ''),
        temp_max: String(item.temp_max || ''),
        style: (item.style || []).join(', '),
        color: item.colors?.length === 1 ? item.colors[0] : '',
        colors: item.colors || [],
        image: p.image_url || null,
        checked: true,
        url,
      }));
    }));
    const allItems = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    const failed = results.filter(r => r.status === 'rejected').length;
    setBatchItems(allItems);
    setBatchLoading(false);
    if (failed > 0) showToast(`${failed}개 URL 파싱 실패`);
  };

  const saveBatchItems = () => {
    const toSave = batchItems.filter(i => i.checked && i.name);
    if (toSave.length === 0) return showToast('저장할 아이템을 선택해주세요');
    const newClothes = toSave.map(i => ({
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      name: i.name, brand: i.brand, price: i.price,
      category: i.category, temp_min: parseInt(i.temp_min)||10, temp_max: parseInt(i.temp_max)||20,
      style: i.style, color: i.color,
      image: i.image, preference: 3,
      purchase_date: new Date().toISOString().split('T')[0],
      added_at: new Date().toISOString(),
    }));
    const updated = [...clothes, ...newClothes];
    setClothes(updated); LS.set('clothes', updated);
    setModalOpen(false); resetModal();
    showToast(`${newClothes.length}개 저장됨`);
  };

  const fetchFromUrl = async () => {
    if (!shopUrl) return showToast('URL을 입력해주세요');
    setUrlLoading(true); setResultTags(null); setFetchedImage('');
    try {
      const r = await fetch('/api/parse-url', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ url:shopUrl }) });
      const p = await r.json();
      if (p.error) throw new Error(p.error);

      // 세트 상품 처리 (items 배열)
      if (p.items && p.items.length > 1) {
        // 여러 아이템 - 첫 번째 폼에 채우고 나머지는 pendingItems로
        const first = p.items[0];
        const firstColors = first.colors || [];
        setClothForm({ name:first.name||'', category:first.category||'상의', temp_min:first.temp_min||'', temp_max:first.temp_max||'', style:(first.style||[]).join(', '), color:firstColors.length===1?firstColors[0]:'', brand:p.brand||'', price:p.price||'' });
        setColorOptions(firstColors.length > 1 ? firstColors : []);
        if (p.image_url) setFetchedImage(p.image_url);
        setResultTags({ ...p, isSet:true, setCount:p.items.length, currentItem:0 });
        setPendingItems(p.items.slice(1).map(item => ({ ...item, brand:p.brand||'', price:p.price||'', image:p.image_url||null })));
      } else {
        // 단품
        const item = p.items?.[0] || p;
        const colors = item.colors || [];
        setClothForm({ name:item.name||'', category:item.category||'상의', temp_min:item.temp_min||'', temp_max:item.temp_max||'', style:(item.style||[]).join(', '), color:colors.length===1?colors[0]:'', brand:p.brand||'', price:p.price||'' });
        if (p.image_url) setFetchedImage(p.image_url);
        setResultTags(p);
        setPendingItems([]);
        setColorOptions(colors.length > 1 ? colors : []);
      }
    } catch(e) { showToast('상품 정보를 가져오지 못했어요'); }
    finally { setUrlLoading(false); }
  };

  const handlePhoto = async (file) => {
    if (!file.type.startsWith('image/')) return showToast('이미지만 가능해요');
    const reader = new FileReader();
    reader.onload = async (e) => {
      const b64 = e.target.result.split(',')[1];
      const mt = file.type;
      setImageBase64(b64); setImageType(mt); setAnalyzeLoading(true);
      try {
        const r = await fetch('/api/claude', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:800, system:'패션 전문가. 옷 사진 분석해 JSON만 반환. {"category":"아우터/상의/하의/원피스/신발/액세서리","name":"색상+종류","colors":["색상"],"material":["소재"],"style":["캐주얼/포멀/미니멀/스트릿/스포티/빈티지"],"temp_min":숫자,"temp_max":숫자}', messages:[{ role:'user', content:[{ type:'image', source:{ type:'base64', media_type:mt, data:b64 } },{ type:'text', text:'분석해주세요.' }] }] })
        });
        const data = await r.json();
        const p = JSON.parse(data.content?.[0]?.text?.replace(/\`\`\`json|\`\`\`/g,'').trim()||'{}');
        setClothForm({ name:p.name||'', category:p.category||'상의', temp_min:p.temp_min||'', temp_max:p.temp_max||'', style:(p.style||[]).join(', '), color:(p.colors||[]).join(', '), brand:p.brand||'', price:p.price||'' });
        setResultTags(p);
      } catch { showToast('분석 오류'); }
      finally { setAnalyzeLoading(false); }
    };
    reader.readAsDataURL(file);
  };

  const saveCloth = () => {
    if (!clothForm.name) return showToast('옷 이름을 입력해주세요');
    if (!clothForm.temp_min||!clothForm.temp_max) return showToast('온도 범위를 입력해주세요');
    const image = imageBase64 ? `data:${imageType};base64,${imageBase64}` : (fetchedImage||null);
    if (editingId) {
      const updated = clothes.map(c => c.id===editingId ? { ...c, ...clothForm, temp_min:parseInt(clothForm.temp_min), temp_max:parseInt(clothForm.temp_max), preference:parseInt(clothForm.preference), image:image||c.image } : c);
      setClothes(updated); LS.set('clothes', updated);
      setModalOpen(false); resetModal();
      showToast(`"${clothForm.name}" 수정됨`);
    } else {
      const newCloth = { id:Date.now().toString(), ...clothForm, temp_min:parseInt(clothForm.temp_min), temp_max:parseInt(clothForm.temp_max), preference:parseInt(clothForm.preference), image, added_at:new Date().toISOString(), price:clothForm.price||'' };
      const updated = [...clothes, newCloth];
      setClothes(updated); LS.set('clothes', updated);
      // 세트 상품 남은 아이템 있으면 다음 아이템 폼으로
      if (pendingItems.length > 0) {
        const next = pendingItems[0];
        setClothForm({ name:next.name||'', category:next.category||'상의', temp_min:String(next.temp_min||''), temp_max:String(next.temp_max||''), style:(next.style||[]).join(', '), color:(next.colors||[]).join(', '), brand:next.brand||'', price:next.price||'' });
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
    setClothForm({ name:'', category:'상의', temp_min:'', temp_max:'', style:'', color:'', brand:'', price:'', season:'', purchase_date: new Date().toISOString().split('T')[0], preference:3 });
    setShopUrl(''); setFetchedImage(''); setImageBase64(null); setImageType(null);
    setResultTags(null); setAddTab('url'); setEditingId(null); setPendingItems([]); setColorOptions([]); setBatchMode(false); setBatchItems([]); setBatchUrls(''); setOrderItems([]);
  };

  const openEditModal = (c) => {
    setEditingId(c.id);
    setClothForm({ name:c.name, category:c.category, temp_min:String(c.temp_min), temp_max:String(c.temp_max), style:c.style||'', color:c.color||'', brand:c.brand||'', price:c.price||'', season:c.season||'', purchase_date:c.purchase_date||new Date().toISOString().split('T')[0], preference:c.preference||3 });
    if (c.image) setFetchedImage(c.image);
    setImageBase64(null); setImageType(null);
    setResultTags(null); setAddTab('url'); setShopUrl('');
    setModalOpen(true);
  };

  const deleteCloth = (id) => { if(!confirm('삭제?'))return; const u=clothes.filter(c=>c.id!==id); setClothes(u); LS.set('clothes',u); };
  const getWeekRecommendation = async () => {
    const homeCity = settings.home_city;
    if (!homeCity) return showToast('설정에서 집 지역을 입력해주세요');
    if (clothes.length === 0) return showToast('먼저 옷을 등록해주세요');
    const activeDays = weekPlan.filter(d => d.active);
    if (activeDays.length === 0) return showToast('하루 이상 선택해주세요');
    setWeekLoading(true); setWeekOutfits([]); setPackingList('');
    try {
      const weatherList = await Promise.all(activeDays.map(async d => {
        const city = d.city || homeCity;
        try {
          const r = await fetch(`/api/weather?city=${encodeURIComponent(city)}&time=09:00`);
          const w = await r.json();
          return { ...d, city, weather: w };
        } catch {
          return { ...d, city, weather: { temp:15, feels_like:13, condition:'정보없음', chance_of_rain:0 } };
        }
      }));
      const cats = ['아우터','상의','하의','원피스','신발'];
      const clothText = cats.map(cat => {
        const items = clothes.filter(c => c.category===cat);
        if (!items.length) return '';
        const today = new Date();
        return '['+cat+'] '+items.map(function(c){
          if (c.last_worn) {
            const worn = new Date(c.last_worn);
            const diffDays = Math.floor((today - worn) / 86400000);
            if (diffDays < 2) return c.name+'(착용불가-'+diffDays+'일전착용)';
          }
          return c.name+'('+c.temp_min+'~'+c.temp_max+'C)';
        }).join(', ');
      }).filter(Boolean).join('\n');
      const dayText = weatherList.map(d => {
        const dateStr = new Date(d.date).toLocaleDateString('ko-KR', { month:'long', day:'numeric', weekday:'short' });
        return `- ${dateStr}: ${d.city} ${d.weather.temp}°C ${d.weather.condition}, ${d.env==='indoor'?d.place:'실외 활동'}, ${d.occasion}`;
      }).join('\n');
      const isTravel = activeDays.some(d => d.city && d.city !== homeCity);
      const r = await fetch('/api/claude', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          model:'claude-sonnet-4-20250514', max_tokens:2000,
          system:'패션 스타일리스트. 주간 코디와 짐싸기 리스트를 JSON으로만 반환. 다른 텍스트 없음.',
          messages:[{ role:'user', content:'일정:\n'+dayText+'\n\n내 옷장:\n'+clothText+'\n\nJSON만 응답:{"outfits":[{"date":"YYYY-MM-DD","outer":"null가능","top":"이름","bottom":"null가능","reason":"이유"}]}' }]
        })
      });
      const data = await r.json();
      const text = data.content?.[0]?.text?.replace(/\`\`\`json|\`\`\`/g,'').trim()||'{}';
      const parsed = JSON.parse(text);
      setWeekOutfits(parsed.outfits||[]);
      if (parsed.packing_list) setPackingList(parsed.packing_list);
    } catch(e) { showToast(e.message||'오류 발생'); }
    finally { setWeekLoading(false); }
  };

  const markWorn = (clothName) => {
    const today = new Date().toISOString().split('T')[0];
    const updated = clothes.map(c => c.name === clothName ? { ...c, last_worn: today } : c);
    setClothes(updated); LS.set('clothes', updated);
    showToast(`"${clothName}" 착용 기록됨`);
  };

  const saveSettings = () => { LS.set('settings', settings); showToast('저장됨'); };
  const addSchedule = () => { if(schedules.length>=6)return showToast('최대 6개'); setSchedules([...schedules,{ city:'', time:'18:00', env:'outdoor', place:'실외 이동', isHome:false }]); };
  const updateSchedule = (i, key, val) => setSchedules(schedules.map((s,idx)=>idx===i?{...s,[key]:val}:s));
  const filtered = (catFilter==='전체' ? clothes : clothes.filter(c=>c.category===catFilter)).slice().sort((a,b)=>new Date(b.added_at||0)-new Date(a.added_at||0));

  const tabStyle = (t) => ({ padding:'7px 14px', borderRadius:99, fontSize:13, fontWeight:500, border:`1px solid ${tab===t?S.accent:S.border}`, background:tab===t?S.accent:S.surface, color:tab===t?'#fff':S.sub, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' });

  return (
    <>
      <Head><title>오늘 뭐 입지</title><meta name="viewport" content="width=device-width, initial-scale=1"/></Head>
      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; } body { font-family: 'Noto Sans KR', -apple-system, sans-serif; background: ${S.bg}; color: ${S.text}; }`}</style>

      {/* 네비 */}
      <nav style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 20px', background:S.surface, borderBottom:`1px solid ${S.border}`, position:'sticky', top:0, zIndex:100 }}>
        <div style={{ fontSize:15, fontWeight:700, letterSpacing:'-0.02em' }}>오늘 뭐 입지</div>
        <div style={{ display:'flex', gap:4 }}>
          {['recommend','closet','settings'].map(t => (
            <button key={t} style={tabStyle(t)} onClick={()=>setTab(t)}>
              {t==='recommend'?'추천':t==='closet'?'옷장':'설정'}
            </button>
          ))}
        </div>
      </nav>

      {/* 추천 탭 */}
      {tab==='recommend' && (
        <div style={{ padding:20, maxWidth:480, margin:'0 auto' }}>
          <div style={{ display:'flex', gap:4, marginBottom:16 }}>
            <button onClick={()=>setRecommendMode('today')} style={{ padding:'8px 18px', borderRadius:99, fontSize:13, fontWeight:500, border:`1px solid ${recommendMode==='today'?S.accent:S.border}`, background:recommendMode==='today'?S.accent:S.surface, color:recommendMode==='today'?'#fff':S.sub, cursor:'pointer', fontFamily:'inherit' }}>오늘 코디</button>
            <button onClick={()=>setRecommendMode('week')} style={{ padding:'8px 18px', borderRadius:99, fontSize:13, fontWeight:500, border:`1px solid ${recommendMode==='week'?S.accent:S.border}`, background:recommendMode==='week'?S.accent:S.surface, color:recommendMode==='week'?'#fff':S.sub, cursor:'pointer', fontFamily:'inherit' }}>주간 / 여행</button>
          </div>
          {recommendMode==='today' && <><div style={card}>
            <div style={{ fontSize:12, fontWeight:500, color:S.sub, marginBottom:12, textTransform:'uppercase', letterSpacing:'0.04em' }}>일정 입력</div>
            {schedules.map((s,i) => (
              <div key={i} style={{ background:S.bg, borderRadius:S.radiusSm, padding:'9px 10px', marginBottom:6, borderLeft:s.isHome?`3px solid #85B7EB`:'none' }}>
                <div style={{ display:'flex', gap:5, alignItems:'center' }}>
                  <input value={s.isHome?'집':s.city} disabled={s.isHome} placeholder="장소명" onChange={e=>updateSchedule(i,'city',e.target.value)}
                    style={{ flex:'1.4', border:`1px solid ${S.border}`, borderRadius:8, padding:'6px 9px', fontSize:12, fontFamily:'inherit', background:s.isHome?S.bg:S.surface, color:s.isHome?S.sub:S.text, outline:'none', minWidth:0 }}/>
                  <select value={s.time} onChange={e=>updateSchedule(i,'time',e.target.value)} style={{ border:`1px solid ${S.border}`, borderRadius:8, padding:'6px 6px', fontSize:11, fontFamily:'inherit', background:S.surface, color:S.text, outline:'none', flexShrink:0 }}>
                    {TIME_OPTS.map((t,ti)=><option key={t} value={t}>{TIME_LABELS[ti]}</option>)}
                  </select>
                  <button onClick={()=>updateSchedule(i,'env','outdoor')||updateSchedule(i,'place','실외 이동')} style={{ padding:'4px 8px', borderRadius:99, fontSize:11, fontWeight:500, border:`1px solid ${s.env==='outdoor'?'#85B7EB':S.border}`, background:s.env==='outdoor'?'#E6F1FB':S.surface, color:s.env==='outdoor'?'#0C447C':S.sub, cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>실외</button>
                  <button onClick={()=>updateSchedule(i,'env','indoor')||updateSchedule(i,'place','오피스')} style={{ padding:'4px 8px', borderRadius:99, fontSize:11, fontWeight:500, border:`1px solid ${s.env==='indoor'?'#EF9F27':S.border}`, background:s.env==='indoor'?'#FAEEDA':S.surface, color:s.env==='indoor'?'#633806':S.sub, cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>실내</button>
                  <select value={s.place} onChange={e=>updateSchedule(i,'place',e.target.value)} style={{ flex:1, border:`1px solid ${S.border}`, borderRadius:8, padding:'6px 6px', fontSize:11, fontFamily:'inherit', background:S.surface, color:S.sub, outline:'none', minWidth:0 }}>
                    {(s.env==='indoor'?INDOOR_PLACES:OUTDOOR_PLACES).map(p=><option key={p} value={p}>{p}</option>)}
                  </select>
                  {!s.isHome && <button onClick={()=>setSchedules(schedules.filter((_,idx)=>idx!==i))} style={{ background:'none', border:'none', color:S.hint, cursor:'pointer', fontSize:13, padding:'0 2px', flexShrink:0 }}>✕</button>}
                </div>
              </div>
            ))}
            <button onClick={addSchedule} style={{ fontSize:12, color:S.sub, cursor:'pointer', padding:'6px 0', display:'inline-flex', alignItems:'center', gap:4, background:'none', border:'none', fontFamily:'inherit', marginTop:4 }}>+ 일정 추가</button>
            <div style={{ marginTop:10 }}>
              <div style={label}>일정 성격</div>
              <select value={occasion} onChange={e=>setOccasion(e.target.value)} style={{ ...input(), marginTop:4 }}>
                {['캐주얼','비즈니스 캐주얼','포멀','야외활동','데이트'].map(o=><option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <button onClick={getRecommendation} style={{ ...btnPrimary({ width:'100%', marginTop:14 }) }}>코디 추천받기</button>
          </div></>}

          {recommendMode==='week' && (
            <div style={card}>
              <div style={{ fontSize:12, fontWeight:500, color:S.sub, marginBottom:12, textTransform:'uppercase', letterSpacing:'0.04em' }}>주간 일정</div>
              <div style={{ display:'flex', gap:4, marginBottom:12 }}>
                {[0,1,2,3].map(w => {
                  const startD = new Date(); startD.setDate(startD.getDate() + w*7);
                  const label = w===0?'이번주':w===1?'다음주':w===2?'다다음주':'3주후';
                  return <button key={w} onClick={()=>setWeekOffset(w)} style={{ flex:1, padding:'6px 0', borderRadius:8, fontSize:11, fontWeight:500, border:`1px solid ${weekOffset===w?S.accent:S.border}`, background:weekOffset===w?S.accent:S.surface, color:weekOffset===w?'#fff':S.sub, cursor:'pointer', fontFamily:'inherit' }}>{label}</button>;
                })}
              </div>
              {weekPlan.slice(weekOffset*7, weekOffset*7+7).map((d, idx) => {
                const i = weekOffset*7 + idx;
                const dateObj = new Date(d.date);
                const dateStr = dateObj.toLocaleDateString('ko-KR', { month:'numeric', day:'numeric', weekday:'short' });
                const isWeekend = dateObj.getDay()===0||dateObj.getDay()===6;
                return (
                  <div key={i} style={{ display:'flex', gap:6, alignItems:'center', marginBottom:8, opacity:d.active?1:0.4 }}>
                    <button onClick={()=>setWeekPlan(weekPlan.map((p,pi)=>pi===i?{...p,active:!p.active}:p))} style={{ width:36, flexShrink:0, padding:'4px 0', borderRadius:8, fontSize:11, fontWeight:500, border:`1px solid ${d.active?S.accent:S.border}`, background:d.active?S.accent:S.surface, color:d.active?'#fff':S.sub, cursor:'pointer', fontFamily:'inherit', textAlign:'center' }}>{dateStr.slice(0,dateStr.indexOf('('))}</button>
                    <span style={{ fontSize:11, color:isWeekend?'#E24B4A':S.sub, flexShrink:0, width:20 }}>{dateStr.slice(dateStr.indexOf('('))}</span>
                    <input value={d.city} onChange={e=>setWeekPlan(weekPlan.map((p,pi)=>pi===i?{...p,city:e.target.value}:p))} placeholder={settings.home_city||'도시명'} disabled={!d.active} style={{ flex:1, border:`1px solid ${S.border}`, borderRadius:8, padding:'5px 8px', fontSize:11, fontFamily:'inherit', background:S.surface, color:S.text, outline:'none', minWidth:0 }}/>
                    <select value={d.place} onChange={e=>setWeekPlan(weekPlan.map((p,pi)=>pi===i?{...p,place:e.target.value,env:INDOOR_PLACES.includes(e.target.value)?'indoor':'outdoor'}:p))} disabled={!d.active} style={{ border:`1px solid ${S.border}`, borderRadius:8, padding:'5px 6px', fontSize:11, fontFamily:'inherit', background:S.surface, color:S.sub, outline:'none', flexShrink:0 }}>
                      {[...OUTDOOR_PLACES,...INDOOR_PLACES].map(p=><option key={p} value={p}>{p}</option>)}
                    </select>
                    <select value={d.occasion} onChange={e=>setWeekPlan(weekPlan.map((p,pi)=>pi===i?{...p,occasion:e.target.value}:p))} disabled={!d.active} style={{ border:`1px solid ${S.border}`, borderRadius:8, padding:'5px 6px', fontSize:11, fontFamily:'inherit', background:S.surface, color:S.sub, outline:'none', flexShrink:0 }}>
                      {['캐주얼','비즈니스 캐주얼','포멀','야외활동','데이트'].map(o=><option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                );
              })}
              <button onClick={getWeekRecommendation} style={{ ...btnPrimary({ width:'100%', marginTop:8 }) }}>주간 코디 추천받기</button>
            </div>
          )}
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
          {loading && (
            <div style={card}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:20, height:20, border:`2px solid ${S.border}`, borderTopColor:S.accent, borderRadius:'50%', animation:'spin 0.7s linear infinite' }}></div>
                <span style={{ fontSize:13, color:S.sub }}>AI가 코디를 고르는 중...</span>
              </div>
            </div>
          )}

          {weekLoading && (
            <div style={card}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:20, height:20, border:`2px solid ${S.border}`, borderTopColor:S.accent, borderRadius:'50%', animation:'spin 0.7s linear infinite' }}></div>
                <span style={{ fontSize:13, color:S.sub }}>7일치 날씨 조회 및 AI 코디 생성 중...</span>
              </div>
            </div>
          )}

          {weekOutfits.length>0 && weekOutfits.map((o,i)=>{
            const clothMap = Object.fromEntries(clothes.map(c=>[c.name,c]));
            const dateObj = new Date(o.date);
            const dateStr = dateObj.toLocaleDateString('ko-KR', { month:'long', day:'numeric', weekday:'short' });
            const layers = [o.outer&&{label:'아우터',name:o.outer},{label:'상의',name:o.top},o.bottom&&{label:'하의',name:o.bottom}].filter(Boolean);
            return (
              <div key={i} style={{ ...card, marginBottom:10 }}>
                <div style={{ fontSize:12, fontWeight:700, color:S.accent, marginBottom:10 }}>{dateStr}</div>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10 }}>
                  {layers.map((l,li)=>{
                    const c = clothMap[l.name];
                    return (
                      <div key={li} style={{ display:'flex', alignItems:'center', gap:6, flex:1 }}>
                        {li>0&&<span style={{ color:S.hint, fontSize:14 }}>+</span>}
                        <div style={{ flex:1, textAlign:'center', minWidth:0 }}>
                          <div style={{ width:'100%', aspectRatio:1, borderRadius:S.radiusSm, background:S.bg, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:4, overflow:'hidden' }}>
                            {c?.image?<img src={c.image} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>:<span style={{ fontSize:20 }}>{CAT_EMOJI[c?.category||l.label]||'👔'}</span>}
                          </div>
                          <div style={{ fontSize:10, color:S.sub }}>{l.label}</div>
                          <div style={{ fontSize:10, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{l.name}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ background:S.bg, borderRadius:S.radiusSm, padding:'8px 10px', fontSize:11, color:S.sub, lineHeight:1.6 }}>{o.reason}</div>
              </div>
            );
          })}

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
          {outfits.map((o,i)=>{
            const clothMap = Object.fromEntries(clothes.map(c=>[c.name,c]));
            const layers = [o.outer&&{label:'아우터',name:o.outer},{label:'상의',name:o.top},o.bottom&&{label:'하의',name:o.bottom}].filter(Boolean);
            return (
              <div key={i} style={{ ...card }}>
                <div style={{ fontSize:11, fontWeight:500, color:S.sub, marginBottom:12 }}>코디 {i+1}</div>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:12 }}>
                  {layers.filter(l=>l.name&&l.name!=='null').map((l,li)=>{
                    const c = clothMap[l.name];
                    return (
                      <div key={li} style={{ display:'flex', alignItems:'center', gap:6, flex:1 }}>
                        {li>0&&<span style={{ color:S.hint, fontSize:14 }}>+</span>}
                        <div style={{ flex:1, textAlign:'center', minWidth:0 }}>
                          <div style={{ width:'100%', aspectRatio:1, borderRadius:S.radiusSm, background:S.bg, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:5, overflow:'hidden' }}>
                            {c?.image?<img src={c.image} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>:<span style={{ fontSize:24 }}>{CAT_EMOJI[c?.category||l.label]||'👔'}</span>}
                          </div>
                          <div style={{ fontSize:10, color:S.sub }}>{l.label}</div>
                          <div style={{ fontSize:11, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{l.name}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ background:S.bg, borderRadius:S.radiusSm, padding:'10px 12px', fontSize:12, color:S.sub, lineHeight:1.6, marginBottom:8 }}>{o.reason}</div>
                <div style={{ background:S.bg, borderRadius:S.radiusSm, padding:'8px 10px', fontSize:11, color:S.sub, lineHeight:1.6 }}>{o.reason}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* 옷장 탭 */}
      {tab==='closet' && (
        <div style={{ padding:20, maxWidth:480, margin:'0 auto' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <div style={{ fontSize:18, fontWeight:700, letterSpacing:'-0.02em' }}>내 옷장</div>
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
            {['전체','아우터','상의','하의','원피스','신발'].map(c=>(
              <button key={c} onClick={()=>setCatFilter(c)} style={{ padding:'6px 12px', borderRadius:99, fontSize:12, fontWeight:500, border:`1px solid ${catFilter===c?S.accent:S.border}`, background:catFilter===c?S.accent:S.surface, color:catFilter===c?'#fff':S.sub, cursor:'pointer', fontFamily:'inherit' }}>{c}</button>
            ))}
          </div>
          {filtered.length===0 ? (
            <div style={{ textAlign:'center', padding:'48px 20px', color:S.sub }}>
              <div style={{ fontSize:40, marginBottom:12 }}>👕</div>
              <p style={{ fontSize:14 }}>등록된 옷이 없어요</p>
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
              {filtered.map(c=>(
                <div key={c.id} onClick={()=>openEditModal(c)} style={{ background:S.surface, border:`1px solid ${S.border}`, borderRadius:S.radiusSm, padding:'10px 8px', textAlign:'center', position:'relative', cursor:'pointer', display:'flex', flexDirection:'column', height:'100%', boxSizing:'border-box' }}>
                  <button onClick={e=>{e.stopPropagation();deleteCloth(c.id);}} style={{ position:'absolute', top:4, right:4, width:18, height:18, borderRadius:'50%', background:'#E24B4A', color:'white', border:'none', fontSize:10, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1 }}>✕</button>
                  <div style={{ width:'100%', height:140, borderRadius:8, background:S.bg, overflow:'hidden', flexShrink:0, marginBottom:8, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {c.image?<img src={c.image} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>:<span style={{ fontSize:28 }}>{CAT_EMOJI[c.category]||'👔'}</span>}
                  </div>
                  <div style={{ fontSize:11, fontWeight:500, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', lineHeight:1.3, minHeight:28, marginBottom:3 }}>{c.name}</div>
                  <div style={{ fontSize:10, color:S.sub, marginTop:'auto' }}>
                    {c.brand && <div style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', marginBottom:1 }}>{c.brand}</div>}
                    {c.price && <div style={{ color:S.accent, fontWeight:500, marginBottom:1 }}>{c.price}</div>}
                    <div>{c.category}{c.category==='액세서리'?(c.season?' · '+c.season:''):' · '+c.temp_min+'~'+c.temp_max+'°C'}</div>
                    {c.purchase_date && <div style={{ color:S.hint, marginTop:1 }}>{c.purchase_date.replace(/-/g,'.')}</div>}
                    <div style={{ color:'#EF9F27', marginTop:2 }}>{'★'.repeat(c.preference||3)}{'☆'.repeat(5-(c.preference||3))}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 설정 탭 */}
      {tab==='settings' && (
        <div style={{ padding:20, maxWidth:480, margin:'0 auto' }}>
          <div style={{ fontSize:18, fontWeight:700, marginBottom:16 }}>설정</div>
          <div style={card}>
            <div style={{ fontSize:12, fontWeight:500, color:S.sub, marginBottom:12 }}>내 정보</div>
            {[{ label:'집 지역', sub:'날씨 조회 기준', key:'home_city', placeholder:'예: 성남시' }].map(({ label:l, sub, key, placeholder })=>(
              <div key={key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderBottom:`1px solid ${S.border}` }}>
                <div style={{ fontSize:14 }}>{l}<span style={{ fontSize:12, color:S.sub, display:'block', marginTop:2 }}>{sub}</span></div>
                <input type="text" value={settings[key]||''} onChange={e=>setSettings({...settings,[key]:e.target.value})} placeholder={placeholder} style={{ border:`1px solid ${S.border}`, borderRadius:S.radiusSm, padding:'8px 12px', fontSize:13, fontFamily:'inherit', background:S.bg, color:S.text, width:150, outline:'none' }}/>
              </div>
            ))}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0' }}>
              <div style={{ fontSize:14 }}>추위 민감도<span style={{ fontSize:12, color:S.sub, display:'block', marginTop:2 }}>체감온도 보정</span></div>
              <select value={settings.cold_sensitivity||0} onChange={e=>setSettings({...settings,cold_sensitivity:parseInt(e.target.value)})} style={{ border:`1px solid ${S.border}`, borderRadius:S.radiusSm, padding:'8px 10px', fontSize:12, fontFamily:'inherit', background:S.surface, color:S.text, outline:'none' }}>
                <option value={-3}>추위 많이 탐</option><option value={-1}>약간 추위 탐</option><option value={0}>보통</option><option value={1}>더위 탐</option><option value={3}>더위 많이 탐</option>
              </select>
            </div>
            <button onClick={saveSettings} style={btnPrimary({ width:'100%', marginTop:12 })}>저장</button>
          </div>
          <div style={card}>
            <div style={{ fontSize:12, fontWeight:500, color:S.sub, marginBottom:12 }}>데이터</div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontSize:14 }}>등록된 옷<span style={{ fontSize:12, color:S.sub, display:'block', marginTop:2 }}>{clothes.length}개</span></div>
              <button onClick={()=>{if(confirm('초기화?')){setClothes([]);LS.set('clothes',[]);}}} style={{ ...btn(), padding:'6px 12px', fontSize:12, color:'#E24B4A', borderColor:'#E24B4A' }}>초기화</button>
            </div>
          </div>
        </div>
      )}

      {/* 모달 */}
      {mounted && modalOpen && createPortal(
        <div onClick={e=>e.target===e.currentTarget&&setModalOpen(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:'20px 20px 0 0', padding:20, width:'100%', maxWidth:480, maxHeight:'85vh', overflowY:'auto' }}>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:16 }}>{editingId ? '옷 수정' : pendingItems.length > 0 ? `옷 추가 (${(resultTags?.setCount||pendingItems.length+1) - pendingItems.length}/${resultTags?.setCount||pendingItems.length+1})` : '옷 추가'}</div>
            <div style={{ display:'flex', gap:4, marginBottom:14 }}>
              {[['url','🔗 쇼핑몰 URL'],['photo','📷 사진 업로드'],['order','🧾 주문 내역']].map(([t,label])=>(
                <button key={t} onClick={()=>setAddTab(t)} style={{ flex:1, padding:'8px 4px', borderRadius:S.radiusSm, fontSize:12, fontWeight:500, border:`1px solid ${S.border}`, background:addTab===t?S.accent:S.bg, color:addTab===t?'#fff':S.sub, cursor:'pointer', fontFamily:'inherit' }}>
                  {label}
                </button>
              ))}
            </div>
            {addTab==='url' && (
              <div>
                <div style={{ display:'flex', gap:4, marginBottom:10 }}>
                  <button onClick={()=>setBatchMode(false)} style={{ flex:1, padding:'7px 0', borderRadius:8, fontSize:12, fontWeight:500, border:`1px solid ${!batchMode?S.accent:S.border}`, background:!batchMode?S.accent:S.surface, color:!batchMode?'#fff':S.sub, cursor:'pointer', fontFamily:'inherit' }}>단일 URL</button>
                  <button onClick={()=>setBatchMode(true)} style={{ flex:1, padding:'7px 0', borderRadius:8, fontSize:12, fontWeight:500, border:`1px solid ${batchMode?S.accent:S.border}`, background:batchMode?S.accent:S.surface, color:batchMode?'#fff':S.sub, cursor:'pointer', fontFamily:'inherit' }}>여러 URL</button>
                </div>
                {batchMode ? (
                  <div>
                    <textarea value={batchUrls} onChange={e=>setBatchUrls(e.target.value)} placeholder={'URL을 한 줄에 하나씩
https://www.musinsa.com/products/123
https://www.musinsa.com/products/456'} style={{ width:'100%', height:90, border:`1px solid ${S.border}`, borderRadius:S.radiusSm, padding:'9px 12px', fontSize:12, fontFamily:'inherit', outline:'none', resize:'none', boxSizing:'border-box', marginBottom:8 }}/>
                    <button onClick={fetchBatch} disabled={batchLoading} style={btnPrimary({ width:'100%' })}>{batchLoading?'파싱 중...':'한꺼번에 가져오기'}</button>
                    {batchItems.length > 0 && (
                      <div style={{ marginTop:12 }}>
                        <div style={{ fontSize:12, color:S.sub, marginBottom:8 }}>{batchItems.length}개 파싱됨 — 확인 후 저장</div>
                        {batchItems.map((item,idx)=>(
                          <div key={item.id} style={{ border:`1px solid ${item.checked?S.accent:S.border}`, borderRadius:10, padding:'10px 12px', marginBottom:8 }}>
                            <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                              {item.image && <img src={item.image} style={{ width:52, height:52, objectFit:'cover', borderRadius:8, flexShrink:0 }} alt=""/>}
                              <div style={{ flex:1, minWidth:0 }}>
                                <input value={item.name} onChange={e=>setBatchItems(batchItems.map((b,i)=>i===idx?{...b,name:e.target.value}:b))} style={{ width:'100%', border:`1px solid ${S.border}`, borderRadius:6, padding:'5px 8px', fontSize:12, fontFamily:'inherit', outline:'none', marginBottom:4, boxSizing:'border-box' }} placeholder="상품명"/>
                                <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                                  <input value={item.brand} onChange={e=>setBatchItems(batchItems.map((b,i)=>i===idx?{...b,brand:e.target.value}:b))} style={{ width:90, border:`1px solid ${S.border}`, borderRadius:6, padding:'4px 7px', fontSize:11, fontFamily:'inherit', outline:'none' }} placeholder="브랜드"/>
                                  <select value={item.category} onChange={e=>setBatchItems(batchItems.map((b,i)=>i===idx?{...b,category:e.target.value}:b))} style={{ border:`1px solid ${S.border}`, borderRadius:6, padding:'4px 6px', fontSize:11, fontFamily:'inherit', outline:'none' }}>
                                    {['아우터','상의','하의','원피스','신발','액세서리'].map(c=><option key={c} value={c}>{c}</option>)}
                                  </select>
                                  {item.colors && item.colors.length > 1 ? (
                                    <select value={item.color} onChange={e=>setBatchItems(batchItems.map((b,i)=>i===idx?{...b,color:e.target.value}:b))} style={{ border:`1.5px solid #85B7EB`, borderRadius:6, padding:'4px 6px', fontSize:11, fontFamily:'inherit', outline:'none', background:'#E6F1FB', color:'#0C447C' }}>
                                      <option value="">색상 선택</option>
                                      {item.colors.map(c=><option key={c} value={c}>{c}</option>)}
                                    </select>
                                  ) : (
                                    <input value={item.color} onChange={e=>setBatchItems(batchItems.map((b,i)=>i===idx?{...b,color:e.target.value}:b))} style={{ width:70, border:`1px solid ${S.border}`, borderRadius:6, padding:'4px 7px', fontSize:11, fontFamily:'inherit', outline:'none' }} placeholder="색상"/>
                                  )}
                                  <input value={item.price} onChange={e=>setBatchItems(batchItems.map((b,i)=>i===idx?{...b,price:e.target.value}:b))} style={{ width:80, border:`1px solid ${S.border}`, borderRadius:6, padding:'4px 7px', fontSize:11, fontFamily:'inherit', outline:'none' }} placeholder="가격"/>
                                </div>
                                <div style={{ display:'flex', gap:4, marginTop:4, alignItems:'center' }}>
                                  <input value={item.temp_min} onChange={e=>setBatchItems(batchItems.map((b,i)=>i===idx?{...b,temp_min:e.target.value}:b))} style={{ width:46, border:`1px solid ${S.border}`, borderRadius:6, padding:'4px 7px', fontSize:11, fontFamily:'inherit', outline:'none' }} placeholder="최저"/>
                                  <span style={{ fontSize:11, color:S.sub }}>~</span>
                                  <input value={item.temp_max} onChange={e=>setBatchItems(batchItems.map((b,i)=>i===idx?{...b,temp_max:e.target.value}:b))} style={{ width:46, border:`1px solid ${S.border}`, borderRadius:6, padding:'4px 7px', fontSize:11, fontFamily:'inherit', outline:'none' }} placeholder="최고"/>
                                  <span style={{ fontSize:11, color:S.sub }}>°C</span>
                                </div>
                              </div>
                              <button onClick={()=>setBatchItems(batchItems.map((b,i)=>i===idx?{...b,checked:!b.checked}:b))} style={{ width:24, height:24, borderRadius:6, border:`1.5px solid ${item.checked?S.accent:S.border}`, background:item.checked?S.accent:'#fff', color:'#fff', fontSize:14, cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>{item.checked?'✓':''}</button>
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
                      <button onClick={()=>document.getElementById('replaceImg').click()} style={{ padding:'5px 10px', borderRadius:8, fontSize:11, fontWeight:500, border:'1px solid #E8E6E0', background:'#fff', cursor:'pointer', fontFamily:'inherit' }}>
                        🔄 이미지 교체
                      </button>
                      <button onClick={()=>removeBackground(fetchedImage)} disabled={removingBg} style={{ padding:'5px 10px', borderRadius:8, fontSize:11, fontWeight:500, border:'1px solid #85B7EB', background:'#E6F1FB', color:'#0C447C', cursor:'pointer', fontFamily:'inherit' }}>
                        {removingBg ? '처리 중...' : '✂️ 누끼따기'}
                      </button>
                    </div>
                    <input id="replaceImg" type="file" accept="image/*" style={{ display:'none' }} onChange={e=>{
                      if(!e.target.files[0]) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        setFetchedImage(ev.target.result);
                        setImageBase64(ev.target.result.split(',')[1]);
                        setImageType(e.target.files[0].type);
                      };
                      reader.readAsDataURL(e.target.files[0]);
                    }}/>
                  </div>
                )}
              </div>
                )}
              </div>
            )}
            {addTab==='photo' && (
              <div onClick={()=>document.getElementById('photoInput').click()} style={{ border:`1.5px dashed ${S.border}`, borderRadius:S.radiusSm, padding:24, textAlign:'center', cursor:'pointer', background:S.bg, marginBottom:10 }}>
                <div style={{ fontSize:24, marginBottom:6, color:S.sub }}>📷</div>
                <div style={{ fontSize:13, color:S.sub }}>사진 업로드하면 AI가 자동 분류해요</div>
                <input id="photoInput" type="file" accept="image/*" style={{ display:'none' }} onChange={e=>e.target.files[0]&&handlePhoto(e.target.files[0])}/>
                {analyzeLoading && <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginTop:10 }}><div style={{ width:20, height:20, border:`2px solid ${S.border}`, borderTopColor:S.accent, borderRadius:'50%', animation:'spin 0.7s linear infinite' }}></div><span style={{ fontSize:13 }}>분석 중...</span></div>}
              </div>
            )}

            {addTab==='order' && (
              <div>
                <div onClick={()=>document.getElementById('orderInput').click()} style={{ border:`1.5px dashed ${S.border}`, borderRadius:S.radiusSm, padding:20, textAlign:'center', cursor:'pointer', background:S.bg, marginBottom:10 }}>
                  <div style={{ fontSize:24, marginBottom:6 }}>🧾</div>
                  <div style={{ fontSize:13, color:S.sub }}>무신사 주문 내역 스크린샷을 업로드하세요</div>
                  <div style={{ fontSize:11, color:S.hint, marginTop:4 }}>색상·가격·구매일자 자동 인식</div>
                  <input id="orderInput" type="file" accept="image/*" style={{ display:'none' }} onChange={e=>e.target.files[0]&&parseOrderImage(e.target.files[0])}/>
                  {orderLoading && <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginTop:10 }}><div style={{ width:20, height:20, border:`2px solid ${S.border}`, borderTopColor:S.accent, borderRadius:'50%', animation:'spin 0.7s linear infinite' }}></div><span style={{ fontSize:13 }}>주문 내역 분석 중...</span></div>}
                </div>
                {orderItems.length > 0 && (
                  <div>
                    <div style={{ fontSize:12, color:S.sub, marginBottom:8 }}>{orderItems.length}개 상품 인식됨</div>
                    {orderItems.map((item,idx)=>(
                      <div key={item.id} style={{ border:`1px solid ${item.checked?S.accent:S.border}`, borderRadius:10, padding:'10px 12px', marginBottom:8 }}>
                        <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                          <div style={{ flex:1, minWidth:0 }}>
                            <input value={item.name} onChange={e=>setOrderItems(orderItems.map((b,i)=>i===idx?{...b,name:e.target.value}:b))} style={{ width:'100%', border:`1px solid ${S.border}`, borderRadius:6, padding:'5px 8px', fontSize:12, fontFamily:'inherit', outline:'none', marginBottom:4, boxSizing:'border-box' }} placeholder="상품명"/>
                            <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                              <input value={item.brand} onChange={e=>setOrderItems(orderItems.map((b,i)=>i===idx?{...b,brand:e.target.value}:b))} style={{ width:90, border:`1px solid ${S.border}`, borderRadius:6, padding:'4px 7px', fontSize:11, fontFamily:'inherit', outline:'none' }} placeholder="브랜드"/>
                              <input value={item.color} onChange={e=>setOrderItems(orderItems.map((b,i)=>i===idx?{...b,color:e.target.value}:b))} style={{ width:70, border:`1px solid ${S.border}`, borderRadius:6, padding:'4px 7px', fontSize:11, fontFamily:'inherit', outline:'none' }} placeholder="색상"/>
                              <input value={item.price} onChange={e=>setOrderItems(orderItems.map((b,i)=>i===idx?{...b,price:e.target.value}:b))} style={{ width:80, border:`1px solid ${S.border}`, borderRadius:6, padding:'4px 7px', fontSize:11, fontFamily:'inherit', outline:'none' }} placeholder="가격"/>
                              <select value={item.category} onChange={e=>setOrderItems(orderItems.map((b,i)=>i===idx?{...b,category:e.target.value}:b))} style={{ border:`1px solid ${S.border}`, borderRadius:6, padding:'4px 6px', fontSize:11, fontFamily:'inherit', outline:'none' }}>
                                {['아우터','상의','하의','원피스','신발','액세서리'].map(c=><option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                            <div style={{ display:'flex', gap:4, marginTop:4, alignItems:'center' }}>
                              <input value={item.purchase_date} onChange={e=>setOrderItems(orderItems.map((b,i)=>i===idx?{...b,purchase_date:e.target.value}:b))} style={{ width:110, border:`1px solid ${S.border}`, borderRadius:6, padding:'4px 7px', fontSize:11, fontFamily:'inherit', outline:'none' }} placeholder="구매일자"/>
                              <input value={item.temp_min} onChange={e=>setOrderItems(orderItems.map((b,i)=>i===idx?{...b,temp_min:e.target.value}:b))} style={{ width:40, border:`1px solid ${S.border}`, borderRadius:6, padding:'4px 7px', fontSize:11, fontFamily:'inherit', outline:'none' }} placeholder="최저"/>
                              <span style={{ fontSize:11, color:S.sub }}>~</span>
                              <input value={item.temp_max} onChange={e=>setOrderItems(orderItems.map((b,i)=>i===idx?{...b,temp_max:e.target.value}:b))} style={{ width:40, border:`1px solid ${S.border}`, borderRadius:6, padding:'4px 7px', fontSize:11, fontFamily:'inherit', outline:'none' }} placeholder="최고"/>
                              <span style={{ fontSize:11, color:S.sub }}>°C</span>
                            </div>
                          </div>
                          <button onClick={()=>setOrderItems(orderItems.map((b,i)=>i===idx?{...b,checked:!b.checked}:b))} style={{ width:24, height:24, borderRadius:6, border:`1.5px solid ${item.checked?S.accent:S.border}`, background:item.checked?S.accent:'#fff', color:'#fff', fontSize:14, cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>{item.checked?'✓':''}</button>
                        </div>
                      </div>
                    ))}
                    <button onClick={saveOrderItems} style={btnPrimary({ width:'100%', marginTop:4 })}>선택 항목 저장 ({orderItems.filter(i=>i.checked).length}개)</button>
                  </div>
                )}
              </div>
            )}
            {resultTags && (
              <div style={{ padding:'10px 12px', background:S.bg, borderRadius:S.radiusSm, margin:'10px 0' }}>
                <div style={{ fontSize:11, color:S.sub, marginBottom:6 }}>{resultTags.brand&&<strong>{resultTags.brand}</strong>}{resultTags.price&&` · ${resultTags.price}`}</div>
                {(resultTags.colors||[]).map(t=><span key={t} style={{ display:'inline-block', padding:'3px 9px', borderRadius:99, fontSize:11, fontWeight:500, margin:2, background:'#E1F5EE', color:'#085041' }}>{t}</span>)}
                {(resultTags.material||[]).map(t=><span key={t} style={{ display:'inline-block', padding:'3px 9px', borderRadius:99, fontSize:11, fontWeight:500, margin:2, background:'#FAEEDA', color:'#633806' }}>{t}</span>)}
                {(resultTags.style||[]).map(t=><span key={t} style={{ display:'inline-block', padding:'3px 9px', borderRadius:99, fontSize:11, fontWeight:500, margin:2, background:'#E6F1FB', color:'#0C447C' }}>{t}</span>)}
                {(resultTags.temp_min||resultTags.temp_max)&&<span style={{ display:'inline-block', padding:'3px 9px', borderRadius:99, fontSize:11, fontWeight:500, margin:2, background:'#EEEDFE', color:'#3C3489' }}>{resultTags.temp_min||'?'}~{resultTags.temp_max||'?'}°C</span>}
                {resultTags.isSet&&<div style={{ marginTop:6, fontSize:11, color:'#0C447C', background:'#E6F1FB', padding:'5px 10px', borderRadius:8 }}>👔 세트 상품 {resultTags.setCount}개 감지 — 저장하면 다음 아이템({pendingItems[0]?.name||''})으로 자동 이동해요</div>}
                {resultTags.images_analyzed>0&&<span style={{ display:'inline-block', padding:'3px 9px', borderRadius:99, fontSize:11, fontWeight:500, margin:2, background:'#EAF3DE', color:'#27500A' }}>이미지 {resultTags.images_analyzed}장 분석</span>}
                {resultTags.detail&&<div style={{ fontSize:11, color:'#633806', marginTop:6, lineHeight:1.5 }}>소재: {resultTags.detail}</div>}
                {resultTags.care&&<div style={{ fontSize:11, color:'#888780', marginTop:4 }}>세탁: {resultTags.care}</div>}
              </div>
            )}
            <div style={{ marginTop:12 }}>
              {[{label:'옷 이름',key:'name',placeholder:'예: 그레이 가디건'},{label:'스타일',key:'style',placeholder:'예: 미니멀, 캐주얼'},{label:'색상',key:'color',placeholder:'예: 라이트 그레이'}].map(({label:l,key,placeholder})=>(
                <div key={key} style={formRow}>
                  <div style={label}>{l}</div>
                  <input value={clothForm[key]} onChange={e=>setClothForm({...clothForm,[key]:e.target.value})} placeholder={placeholder} style={input()}/>
                </div>
              ))}
              {colorOptions.length > 0 && (
                <div style={{ marginBottom:12, padding:'10px 12px', background:'#E6F1FB', borderRadius:10 }}>
                  <div style={{ fontSize:12, color:'#0C447C', fontWeight:500, marginBottom:8 }}>구매할 색상을 선택해주세요</div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {colorOptions.map(c => (
                      <button key={c} onClick={()=>{ setClothForm(f=>({...f, color:c})); setColorOptions([]); }} style={{ padding:'5px 12px', borderRadius:99, fontSize:12, fontWeight:500, border:`1px solid ${clothForm.color===c?'#0C447C':'#B5D4F4'}`, background:clothForm.color===c?'#0C447C':'#fff', color:clothForm.color===c?'#fff':'#0C447C', cursor:'pointer', fontFamily:'inherit' }}>{c}</button>
                    ))}
                  </div>
                </div>
              )}
              <div style={formRow}>
                <div style={label}>브랜드</div>
                <input
                  value={clothForm.brand}
                  onChange={e=>setClothForm({...clothForm,brand:e.target.value})}
                  placeholder="예: 무신사 스탠다드"
                  list="brand-list"
                  style={input()}
                  autoComplete="off"
                />
                <datalist id="brand-list">
                  {[...new Set(clothes.map(c=>c.brand).filter(Boolean))].map(b=>(
                    <option key={b} value={b}/>
                  ))}
                </datalist>
              </div>
              <div style={formRow}>
                <div style={label}>가격</div>
                <input value={clothForm.price||''} onChange={e=>setClothForm({...clothForm,price:e.target.value})} placeholder="예: 45,000원" style={input()}/>
              </div>
              <div style={formRow}>
                <div style={label}>카테고리</div>
                <select value={clothForm.category} onChange={e=>{
                  const cat = e.target.value;
                  if (cat === '액세서리') {
                    setClothForm({...clothForm, category:cat, temp_min:'-99', temp_max:'99', season:'사계절'});
                  } else {
                    setClothForm({...clothForm, category:cat, season:''});
                  }
                }} style={input()}>
                  {['아우터','상의','하의','원피스','신발','액세서리'].map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {clothForm.category === '액세서리' && (
                <div style={formRow}>
                  <div style={label}>시즌</div>
                  <div style={{ display:'flex', gap:6, marginTop:4 }}>
                    {[['사계절','-99','99'],['봄/가을','10','22'],['여름','23','35'],['겨울','-15','12']].map(([s,mn,mx])=>(
                      <button key={s} onClick={()=>setClothForm({...clothForm,season:s,temp_min:mn,temp_max:mx})} style={{ flex:1, padding:'6px 0', borderRadius:8, fontSize:11, fontWeight:500, border:`1px solid ${clothForm.season===s?S.accent:S.border}`, background:clothForm.season===s?S.accent:S.surface, color:clothForm.season===s?'#fff':S.sub, cursor:'pointer', fontFamily:'inherit' }}>{s}</button>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {[{label:'최저 온도 (°C)',key:'temp_min',placeholder:'10'},{label:'최고 온도 (°C)',key:'temp_max',placeholder:'18'}].map(({label:l,key,placeholder})=>(
                  <div key={key} style={formRow}>
                    <div style={label}>{l}</div>
                    <input value={clothForm[key]} onChange={e=>setClothForm({...clothForm,[key]:e.target.value})} placeholder={placeholder} style={input()}/>
                  </div>
                ))}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <div style={formRow}>
                  <div style={label}>구매 일자</div>
                  <input type="date" value={clothForm.purchase_date} onChange={e=>setClothForm({...clothForm,purchase_date:e.target.value})} style={input()}/>
                </div>
                <div style={formRow}>
                  <div style={label}>선호도</div>
                  <div style={{ display:'flex', gap:4, marginTop:4 }}>
                    {[1,2,3,4,5].map(n=>(
                      <button key={n} onClick={()=>setClothForm({...clothForm,preference:n})} style={{ flex:1, padding:'7px 0', borderRadius:8, fontSize:16, border:`1px solid ${clothForm.preference>=n?'#EF9F27':'#E8E6E0'}`, background:clothForm.preference>=n?'#FAEEDA':'#fff', cursor:'pointer', lineHeight:1 }}>★</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display:'flex', gap:8, marginTop:16 }}>
              <button onClick={()=>setModalOpen(false)} style={btn({ flex:1 })}>취소</button>
              <button onClick={saveCloth} style={btnPrimary({ flex:1 })}>{editingId ? '수정 완료' : '저장'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {mounted && tab==='closet' && createPortal(
        <button onClick={()=>{resetModal();setModalOpen(true);}} style={{ position:'fixed', bottom:28, left:'50%', transform:'translateX(-50%)', background:S.accent, color:'#fff', border:'none', borderRadius:99, padding:'15px 0', fontSize:15, fontWeight:700, fontFamily:'inherit', cursor:'pointer', boxShadow:'0 6px 24px rgba(0,0,0,0.25)', zIndex:200, whiteSpace:'nowrap', letterSpacing:'-0.01em', width:'calc(100% - 80px)', maxWidth:400, display:'block', textAlign:'center' }}>＋ 옷 추가하기</button>,
        document.body
      )}

      {mounted && toast && createPortal(
        <div style={{ position:'fixed', bottom:90, left:'50%', transform:'translateX(-50%)', background:S.accent, color:'#fff', padding:'10px 20px', borderRadius:99, fontSize:13, zIndex:9999, whiteSpace:'nowrap' }}>{toast}</div>,
        document.body
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
