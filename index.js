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
  const [mounted, setMounted] = useState(false);

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
        return `[${cat}] ${items.map(c=>`${c.name}(${c.temp_min}~${c.temp_max}°C, 선호도:${'★'.repeat(c.preference||3)})`).join(', ')}`;
      }).filter(Boolean).join('\n');
      const weatherText = wList.map(w => `- ${w.time} [${w.isIndoor?'실내':'실외'}] ${w.city}: ${w.temp}°C`).join('\n');
      const minTemp = Math.min(...wList.filter(w=>!w.isIndoor).map(w=>w.feels_like).filter(Boolean));
      const hasRain = wList.some(w=>!w.isIndoor && w.chance_of_rain>30);
      const r = await fetch('/api/claude', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          model:'claude-sonnet-4-20250514', max_tokens:1000,
          system:'패션 스타일리스트. 옷장과 날씨로 최적 코디를 JSON으로만 추천. 다른 텍스트 없음.',
          messages:[{ role:'user', content:`오늘 일정:\n${weatherText}\n실외 최저체감: ${minTemp}°C\n${hasRain?'우천 가능':''}\n일정: ${occasion}\n\n옷장:\n${clothText}\n\n코디 3가지 추천. 실내 체류 많으면 이너 중요. 탈착 쉬운 아우터 우선. 선호도 높은 옷(★★★★★, ★★★★)을 우선 추천하되 코디 조화도 함께 고려.\n\n{"outfits":[{"outer":"이름또는null","top":"이름","bottom":"이름또는null","reason":"이유"}]}` }]
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

  const fetchFromUrl = async () => {
    if (!shopUrl) return showToast('URL을 입력해주세요');
    setUrlLoading(true); setResultTags(null); setFetchedImage('');
    try {
      const r = await fetch('/api/parse-url', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ url:shopUrl }) });
      const p = await r.json();
      if (p.error) throw new Error(p.error);
      setClothForm({ name:p.name||'', category:p.category||'상의', temp_min:p.temp_min||'', temp_max:p.temp_max||'', style:(p.style||[]).join(', '), color:(p.colors||[]).join(', ') });
      if (p.image_url) setFetchedImage(p.image_url);
      setResultTags(p);
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
        setClothForm({ name:p.name||'', category:p.category||'상의', temp_min:p.temp_min||'', temp_max:p.temp_max||'', style:(p.style||[]).join(', '), color:(p.colors||[]).join(', ') });
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
      const newCloth = { id:Date.now().toString(), ...clothForm, temp_min:parseInt(clothForm.temp_min), temp_max:parseInt(clothForm.temp_max), preference:parseInt(clothForm.preference), image, added_at:new Date().toISOString() };
      const updated = [...clothes, newCloth];
      setClothes(updated); LS.set('clothes', updated);
      setModalOpen(false); resetModal();
      showToast(`"${clothForm.name}" 추가됨`);
    }
  };

  const resetModal = () => {
    setClothForm({ name:'', category:'상의', temp_min:'', temp_max:'', style:'', color:'', purchase_date: new Date().toISOString().split('T')[0], preference:3 });
    setShopUrl(''); setFetchedImage(''); setImageBase64(null); setImageType(null);
    setResultTags(null); setAddTab('url'); setEditingId(null);
  };

  const openEditModal = (c) => {
    setEditingId(c.id);
    setClothForm({ name:c.name, category:c.category, temp_min:String(c.temp_min), temp_max:String(c.temp_max), style:c.style||'', color:c.color||'', purchase_date:c.purchase_date||new Date().toISOString().split('T')[0], preference:c.preference||3 });
    if (c.image) setFetchedImage(c.image);
    setImageBase64(null); setImageType(null);
    setResultTags(null); setAddTab('url'); setShopUrl('');
    setModalOpen(true);
  };

  const deleteCloth = (id) => { if(!confirm('삭제?'))return; const u=clothes.filter(c=>c.id!==id); setClothes(u); LS.set('clothes',u); };
  const saveSettings = () => { LS.set('settings', settings); showToast('저장됨'); };
  const addSchedule = () => { if(schedules.length>=6)return showToast('최대 6개'); setSchedules([...schedules,{ city:'', time:'18:00', env:'outdoor', place:'실외 이동', isHome:false }]); };
  const updateSchedule = (i, key, val) => setSchedules(schedules.map((s,idx)=>idx===i?{...s,[key]:val}:s));
  const filtered = catFilter==='전체' ? clothes : clothes.filter(c=>c.category===catFilter);

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
          <div style={{ fontSize:18, fontWeight:700, marginBottom:16, letterSpacing:'-0.02em' }}>오늘의 코디</div>
          <div style={card}>
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
          </div>
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
          {outfits.map((o,i)=>{
            const clothMap = Object.fromEntries(clothes.map(c=>[c.name,c]));
            const layers = [o.outer&&{label:'아우터',name:o.outer},{label:'상의',name:o.top},o.bottom&&{label:'하의',name:o.bottom}].filter(Boolean);
            return (
              <div key={i} style={{ ...card }}>
                <div style={{ fontSize:11, fontWeight:500, color:S.sub, marginBottom:12 }}>코디 {i+1}</div>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:12 }}>
                  {layers.map((l,li)=>{
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
                <div style={{ background:S.bg, borderRadius:S.radiusSm, padding:'10px 12px', fontSize:12, color:S.sub, lineHeight:1.6 }}>{o.reason}</div>
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
            <button onClick={()=>{resetModal();setModalOpen(true);}} style={btnPrimary({ padding:'7px 14px', fontSize:12 })}>+ 옷 추가</button>
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
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
              {filtered.map(c=>(
                <div key={c.id} onClick={()=>openEditModal(c)} style={{ background:S.surface, border:`1px solid ${S.border}`, borderRadius:S.radiusSm, padding:'10px 8px', textAlign:'center', position:'relative', cursor:'pointer' }}>
                  <button onClick={e=>{e.stopPropagation();deleteCloth(c.id);}} style={{ position:'absolute', top:4, right:4, width:18, height:18, borderRadius:'50%', background:'#E24B4A', color:'white', border:'none', fontSize:10, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
                  <div style={{ width:'100%', aspectRatio:1, borderRadius:8, background:S.bg, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:6, overflow:'hidden' }}>
                    {c.image?<img src={c.image} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>:<span style={{ fontSize:28 }}>{CAT_EMOJI[c.category]||'👔'}</span>}
                  </div>
                  <div style={{ fontSize:11, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.name}</div>
                  {c.brand && <div style={{ fontSize:10, color:S.sub, marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.brand}</div>}
                  <div style={{ fontSize:10, color:S.sub, marginTop:1 }}>{c.category} · {c.temp_min}~{c.temp_max}°C</div>
                  {c.purchase_date && <div style={{ fontSize:10, color:S.hint, marginTop:1 }}>{c.purchase_date.replace(/-/g,'.')}</div>}
                  <div style={{ fontSize:10, color:'#EF9F27', marginTop:1 }}>{'★'.repeat(c.preference||3)}{'☆'.repeat(5-(c.preference||3))}</div>
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
            <div style={{ fontSize:16, fontWeight:700, marginBottom:16 }}>{editingId ? '옷 수정' : '옷 추가'}</div>
            <div style={{ display:'flex', gap:4, marginBottom:14 }}>
              {['url','photo'].map(t=>(
                <button key={t} onClick={()=>setAddTab(t)} style={{ flex:1, padding:9, borderRadius:S.radiusSm, fontSize:13, fontWeight:500, border:`1px solid ${S.border}`, background:addTab===t?S.accent:S.bg, color:addTab===t?'#fff':S.sub, cursor:'pointer', fontFamily:'inherit' }}>
                  {t==='url'?'🔗 쇼핑몰 URL':'📷 사진 업로드'}
                </button>
              ))}
            </div>
            {addTab==='url' && (
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
            {addTab==='photo' && (
              <div onClick={()=>document.getElementById('photoInput').click()} style={{ border:`1.5px dashed ${S.border}`, borderRadius:S.radiusSm, padding:24, textAlign:'center', cursor:'pointer', background:S.bg, marginBottom:10 }}>
                <div style={{ fontSize:24, marginBottom:6, color:S.sub }}>📷</div>
                <div style={{ fontSize:13, color:S.sub }}>사진 업로드하면 AI가 자동 분류해요</div>
                <input id="photoInput" type="file" accept="image/*" style={{ display:'none' }} onChange={e=>e.target.files[0]&&handlePhoto(e.target.files[0])}/>
                {analyzeLoading && <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginTop:10 }}><div style={{ width:20, height:20, border:`2px solid ${S.border}`, borderTopColor:S.accent, borderRadius:'50%', animation:'spin 0.7s linear infinite' }}></div><span style={{ fontSize:13 }}>분석 중...</span></div>}
              </div>
            )}
            {resultTags && (
              <div style={{ padding:'10px 12px', background:S.bg, borderRadius:S.radiusSm, margin:'10px 0' }}>
                <div style={{ fontSize:11, color:S.sub, marginBottom:6 }}>{resultTags.brand&&<strong>{resultTags.brand}</strong>}{resultTags.price&&` · ${resultTags.price}`}</div>
                {(resultTags.colors||[]).map(t=><span key={t} style={{ display:'inline-block', padding:'3px 9px', borderRadius:99, fontSize:11, fontWeight:500, margin:2, background:'#E1F5EE', color:'#085041' }}>{t}</span>)}
                {(resultTags.material||[]).map(t=><span key={t} style={{ display:'inline-block', padding:'3px 9px', borderRadius:99, fontSize:11, fontWeight:500, margin:2, background:'#FAEEDA', color:'#633806' }}>{t}</span>)}
                {(resultTags.style||[]).map(t=><span key={t} style={{ display:'inline-block', padding:'3px 9px', borderRadius:99, fontSize:11, fontWeight:500, margin:2, background:'#E6F1FB', color:'#0C447C' }}>{t}</span>)}
                {(resultTags.temp_min||resultTags.temp_max)&&<span style={{ display:'inline-block', padding:'3px 9px', borderRadius:99, fontSize:11, fontWeight:500, margin:2, background:'#EEEDFE', color:'#3C3489' }}>{resultTags.temp_min||'?'}~{resultTags.temp_max||'?'}°C</span>}
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
              <div style={formRow}>
                <div style={label}>카테고리</div>
                <select value={clothForm.category} onChange={e=>setClothForm({...clothForm,category:e.target.value})} style={input()}>
                  {['아우터','상의','하의','원피스','신발','액세서리'].map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
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

      {mounted && toast && createPortal(
        <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:S.accent, color:'#fff', padding:'10px 20px', borderRadius:99, fontSize:13, zIndex:9999, whiteSpace:'nowrap' }}>{toast}</div>,
        document.body
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
