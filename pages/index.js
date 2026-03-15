import { useState, useEffect } from 'react';
import Head from 'next/head';
import styles from '../styles/Home.module.css';

// 로컬스토리지 헬퍼
const LS = {
  get: (k, d = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const INDOOR_TEMPS = { '오피스': 22, '카페': 21, '백화점/쇼핑몰': 20, '식당': 21, '대중교통': 22, '기타 실내': 21 };
const CAT_EMOJI = { '아우터': '🧥', '상의': '👕', '하의': '👖', '원피스': '👗', '신발': '👟', '액세서리': '👜' };
const TIME_OPTS = ['06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00'];
const TIME_LABELS = ['오전 6시','오전 7시','오전 8시','오전 9시','오전 10시','오전 11시','낮 12시','오후 1시','오후 2시','오후 3시','오후 4시','오후 5시','오후 6시','오후 7시','저녁 8시','밤 9시','밤 10시'];
const OUTDOOR_PLACES = ['실외 이동', '야외 활동'];
const INDOOR_PLACES = ['오피스', '카페', '백화점/쇼핑몰', '식당', '대중교통', '기타 실내'];

export default function Home() {
  const [tab, setTab] = useState('recommend');
  const [clothes, setClothes] = useState([]);
  const [schedules, setSchedules] = useState([
    { city: '집', time: '08:00', env: 'outdoor', place: '실외 이동', isHome: true },
    { city: '', time: '09:00', env: 'indoor', place: '오피스', isHome: false },
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
  const [clothForm, setClothForm] = useState({ name:'', category:'상의', temp_min:'', temp_max:'', style:'', color:'' });
  const [settings, setSettings] = useState({ home_city:'', cold_sensitivity:0, anthropic_key:'', weather_key:'' });
  const [toast, setToast] = useState('');
  const [imageBase64, setImageBase64] = useState(null);
  const [imageType, setImageType] = useState(null);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [resultTags, setResultTags] = useState(null);

  useEffect(() => {
    setClothes(LS.get('clothes', []));
    setSettings(LS.get('settings', { home_city:'', cold_sensitivity:0, anthropic_key:'', weather_key:'' }));
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  // 날씨 fetch
  const fetchWeather = async (city, time) => {
    const r = await fetch(`/api/weather?city=${encodeURIComponent(city)}&time=${time}`);
    if (!r.ok) throw new Error(`날씨 정보 오류 (${city})`);
    return r.json();
  };

  // 추천
  const getRecommendation = async () => {
    if (clothes.length === 0) return showToast('먼저 옷을 등록해주세요');
    const homeCity = settings.home_city;
    if (!homeCity) return showToast('설정에서 집 지역을 먼저 입력해주세요');
    setLoading(true); setOutfits([]); setWeatherList([]);
    try {
      const locs = schedules.map(s => ({ ...s, city: s.isHome ? homeCity : s.city }));
      const outdoorLocs = locs.filter(l => l.env === 'outdoor' && l.city);
      const weatherResults = await Promise.all(outdoorLocs.map(l => fetchWeather(l.city, l.time)));
      const wMap = {};
      outdoorLocs.forEach((l, i) => { wMap[l.city + l.time] = weatherResults[i]; });
      const wList = locs.map(l => {
        if (l.env === 'indoor') return { city: l.place, time: l.time, temp: INDOOR_TEMPS[l.place]||21, feels_like: INDOOR_TEMPS[l.place]||21, condition: `실내(${l.place})`, chance_of_rain: 0, isIndoor: true };
        return wMap[l.city + l.time] || { city: l.city, time: l.time, temp:15, feels_like:13, condition:'정보없음', chance_of_rain:0 };
      });
      setWeatherList(wList);

      const cats = ['아우터','상의','하의','원피스','신발'];
      const clothText = cats.map(cat => {
        const items = clothes.filter(c => c.category === cat);
        if (!items.length) return '';
        return `[${cat}] ${items.map(c => `${c.name}(${c.temp_min}~${c.temp_max}°C,${c.style||''},${c.color||''})`).join(', ')}`;
      }).filter(Boolean).join('\n');

      const weatherText = wList.map(w =>
        `- ${w.time} [${w.isIndoor?'실내':'실외'}] ${w.city}: ${w.temp}°C${!w.isIndoor?` 체감${w.feels_like}°C, ${w.condition}`:''}${w.chance_of_rain>30?` 강수${w.chance_of_rain}%`:''}`
      ).join('\n');

      const minTemp = Math.min(...wList.filter(w=>!w.isIndoor).map(w=>w.feels_like).filter(Boolean));
      const hasRain = wList.some(w=>!w.isIndoor && w.chance_of_rain>30);
      const indoorPlaces = [...new Set(wList.filter(w=>w.isIndoor).map(w=>w.city))];

      const r = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: '패션 스타일리스트. 옷장과 날씨로 최적 코디를 JSON으로만 추천. 다른 텍스트 없음.',
          messages: [{ role: 'user', content: `오늘 일정:\n${weatherText}\n실외 최저체감: ${minTemp}°C\n${indoorPlaces.length?`실내 장소: ${indoorPlaces.join(', ')}`:''}\n${hasRain?'우천 가능':''}\n일정: ${occasion}\n\n옷장:\n${clothText}\n\n코디 3가지 추천. 실내 체류 많으면 이너 중요. 탈착 쉬운 아우터 우선.\n\n{"outfits":[{"outer":"이름또는null","top":"이름","bottom":"이름또는null","reason":"이유"}]}` }]
        })
      });
      const data = await r.json();
      const text = data.content?.[0]?.text?.replace(/```json|```/g,'').trim()||'{}';
      setOutfits(JSON.parse(text).outfits || []);
    } catch(e) { showToast(e.message || '오류 발생'); }
    finally { setLoading(false); }
  };

  // URL 파싱
  const fetchFromUrl = async () => {
    if (!shopUrl) return showToast('URL을 입력해주세요');
    setUrlLoading(true); setResultTags(null); setFetchedImage('');
    try {
      const r = await fetch('/api/parse-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: shopUrl })
      });
      const p = await r.json();
      if (p.error) throw new Error(p.error);
      setClothForm({ name: p.name||'', category: p.category||'상의', temp_min: p.temp_min||'', temp_max: p.temp_max||'', style: (p.style||[]).join(', '), color: (p.colors||[]).join(', ') });
      if (p.image_url) setFetchedImage(p.image_url);
      setResultTags(p);
    } catch(e) { showToast('상품 정보를 가져오지 못했어요: ' + e.message); }
    finally { setUrlLoading(false); }
  };

  // 사진 분석
  const handlePhoto = async (file) => {
    if (!file.type.startsWith('image/')) return showToast('이미지만 가능해요');
    const reader = new FileReader();
    reader.onload = async (e) => {
      const b64 = e.target.result.split(',')[1];
      const mt = file.type;
      setImageBase64(b64); setImageType(mt);
      setAnalyzeLoading(true);
      try {
        const r = await fetch('/api/claude', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514', max_tokens: 800,
            system: '패션 전문가. 옷 사진 분석해 JSON만 반환. {"category":"아우터/상의/하의/원피스/신발/액세서리","name":"색상+종류","colors":["색상"],"material":["소재"],"season":["봄/여름/가을/겨울"],"style":["캐주얼/포멀/미니멀/스트릿/스포티/빈티지"],"temp_min":숫자,"temp_max":숫자}',
            messages: [{ role:'user', content:[{ type:'image', source:{ type:'base64', media_type:mt, data:b64 } },{ type:'text', text:'분석해주세요.' }] }]
          })
        });
        const data = await r.json();
        const p = JSON.parse(data.content?.[0]?.text?.replace(/```json|```/g,'').trim()||'{}');
        setClothForm({ name:p.name||'', category:p.category||'상의', temp_min:p.temp_min||'', temp_max:p.temp_max||'', style:(p.style||[]).join(', '), color:(p.colors||[]).join(', ') });
        setResultTags(p);
      } catch { showToast('분석 오류'); }
      finally { setAnalyzeLoading(false); }
    };
    reader.readAsDataURL(file);
  };

  // 옷 저장
  const saveCloth = () => {
    if (!clothForm.name) return showToast('옷 이름을 입력해주세요');
    if (!clothForm.temp_min || !clothForm.temp_max) return showToast('온도 범위를 입력해주세요');
    const image = imageBase64 ? `data:${imageType};base64,${imageBase64}` : (fetchedImage || null);
    const newCloth = { id: Date.now().toString(), ...clothForm, temp_min: parseInt(clothForm.temp_min), temp_max: parseInt(clothForm.temp_max), image, added_at: new Date().toISOString() };
    const updated = [...clothes, newCloth];
    setClothes(updated); LS.set('clothes', updated);
    setModalOpen(false); resetModal();
    showToast(`"${clothForm.name}" 추가됨`);
  };

  const resetModal = () => {
    setClothForm({ name:'', category:'상의', temp_min:'', temp_max:'', style:'', color:'' });
    setShopUrl(''); setFetchedImage(''); setImageBase64(null); setImageType(null);
    setResultTags(null); setAddTab('url');
  };

  const deleteCloth = (id) => {
    if (!confirm('삭제할까요?')) return;
    const updated = clothes.filter(c => c.id !== id);
    setClothes(updated); LS.set('clothes', updated);
  };

  const saveSettings = () => { LS.set('settings', settings); showToast('저장됨'); };

  const addSchedule = () => {
    if (schedules.length >= 6) return showToast('최대 6개');
    setSchedules([...schedules, { city:'', time:'18:00', env:'outdoor', place:'실외 이동', isHome:false }]);
  };

  const updateSchedule = (i, key, val) => {
    const updated = schedules.map((s, idx) => idx === i ? { ...s, [key]: val } : s);
    setSchedules(updated);
  };

  const filtered = catFilter === '전체' ? clothes : clothes.filter(c => c.category === catFilter);

  return (
    <>
      <Head><title>오늘 뭐 입지</title><meta name="viewport" content="width=device-width, initial-scale=1"/></Head>

      <nav className={styles.nav}>
        <div className={styles.navTitle}>오늘 뭐 입지</div>
        <div className={styles.navTabs}>
         {['recommend','closet','settings'].map(t => (
  <button key={t} className={styles.navTab + (tab===t?' '+styles.active:'')} onClick={() => setTab(t)}>
    {t==='recommend'?'추천':t==='closet'?'옷장':'설정'}
  </button>
))}
        </div>
      </nav>

      {/* 추천 탭 */}
      {tab === 'recommend' && (
        <div className={styles.page}>
          <div className={styles.sectionTitle}>오늘의 코디</div>
          <div className={styles.card}>
            <div className={styles.cardTitle}>일정 입력</div>
            {schedules.map((s, i) => (
              <div key={i} className={`${styles.scheduleItem} ${s.isHome ? styles.homeItem : ''}`}>
                <div className={styles.scheduleRow}>
                  <input value={s.isHome ? '집' : s.city} disabled={s.isHome}
                    placeholder="장소명 (예: 수원)" onChange={e => updateSchedule(i, 'city', e.target.value)}
                    className={styles.scheduleInput} />
                  <select value={s.time} onChange={e => updateSchedule(i, 'time', e.target.value)} className={styles.timeSelect}>
                    {TIME_OPTS.map((t,ti) => <option key={t} value={t}>{TIME_LABELS[ti]}</option>)}
                  </select>
                  <button className={`${styles.envBtn} ${s.env==='outdoor'?styles.outdoor:''}`}
                    onClick={() => updateSchedule(i, 'env', 'outdoor') || updateSchedule(i, 'place', '실외 이동')}>실외</button>
                  <button className={`${styles.envBtn} ${s.env==='indoor'?styles.indoor:''}`}
                    onClick={() => updateSchedule(i, 'env', 'indoor') || updateSchedule(i, 'place', '오피스')}>실내</button>
                  <select value={s.place} onChange={e => updateSchedule(i, 'place', e.target.value)} className={styles.placeSelect}>
                    {(s.env==='indoor' ? INDOOR_PLACES : OUTDOOR_PLACES).map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  {!s.isHome && <button className={styles.delBtn} onClick={() => setSchedules(schedules.filter((_,idx)=>idx!==i))}>✕</button>}
                </div>
              </div>
            ))}
            <button className={styles.addBtn} onClick={addSchedule}>+ 일정 추가</button>
            <div style={{marginTop:10}}>
              <div className={styles.formLabel}>일정 성격</div>
              <select value={occasion} onChange={e=>setOccasion(e.target.value)} className={styles.formInput} style={{marginTop:4}}>
                {['캐주얼','비즈니스 캐주얼','포멀','야외활동','데이트'].map(o=><option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <button className={`${styles.btn} ${styles.btnPrimary} ${styles.btnFull}`} style={{marginTop:14}} onClick={getRecommendation}>
              코디 추천받기
            </button>
          </div>

          {weatherList.length > 0 && (
            <div className={styles.card}>
              <div className={styles.cardTitle}>오늘 날씨</div>
              {weatherList.map((w,i) => (
                <div key={i} className={styles.weatherChip}>
                  <div>
                    <div style={{fontSize:11,color:'var(--text-sub)'}}>{w.time} {w.isIndoor && <span className={styles.indoorBadge}>실내</span>}</div>
                    <div style={{fontSize:12}}>{w.city}{!w.isIndoor && ` · ${w.condition}`}</div>
                  </div>
                  <div className={styles.tempBig}>{w.temp}°C</div>
                </div>
              ))}
            </div>
          )}

          {loading && (
            <div className={styles.card}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div className={styles.spinner}></div>
                <span style={{fontSize:13,color:'var(--text-sub)'}}>AI가 코디를 고르는 중...</span>
              </div>
            </div>
          )}

          {outfits.map((o, i) => {
            const clothMap = Object.fromEntries(clothes.map(c => [c.name, c]));
            const layers = [o.outer&&{label:'아우터',name:o.outer}, {label:'상의',name:o.top}, o.bottom&&{label:'하의',name:o.bottom}].filter(Boolean);
            return (
              <div key={i} className={styles.outfitCard}>
                <div className={styles.outfitNum}>코디 {i+1}</div>
                <div className={styles.layerRow}>
                  {layers.map((l,li) => {
                    const c = clothMap[l.name];
                    return (
                      <div key={li} style={{display:'flex',alignItems:'center',gap:6,flex:1}}>
                        {li > 0 && <span style={{color:'var(--text-hint)',fontSize:14}}>+</span>}
                        <div className={styles.layerItem}>
                          <div className={styles.layerThumb}>
                            {c?.image ? <img src={c.image} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/> : <span style={{fontSize:24}}>{CAT_EMOJI[c?.category||l.label]||'👔'}</span>}
                          </div>
                          <div className={styles.layerLabel}>{l.label}</div>
                          <div className={styles.layerName}>{l.name}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className={styles.reasonBox}>{o.reason}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* 옷장 탭 */}
      {tab === 'closet' && (
        <div className={styles.page}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
            <div className={styles.sectionTitle} style={{margin:0}}>내 옷장</div>
            <button className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`} onClick={()=>{resetModal();setModalOpen(true);}}>+ 옷 추가</button>
          </div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>
            {['전체','아우터','상의','하의','원피스','신발'].map(c => (
              <button key={c} className={`${styles.btn} ${styles.btnSm} ${catFilter===c?styles.active:''}`} onClick={()=>setCatFilter(c)}>{c}</button>
            ))}
          </div>
          {filtered.length === 0 ? (
            <div className={styles.empty}><div style={{fontSize:40,marginBottom:12}}>👕</div><p>등록된 옷이 없어요</p></div>
          ) : (
            <div className={styles.clothGrid}>
              {filtered.map(c => (
                <div key={c.id} className={styles.clothItem}>
                  <button className={styles.delClothBtn} onClick={()=>deleteCloth(c.id)}>✕</button>
                  <div className={styles.thumb}>
                    {c.image ? <img src={c.image} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/> : <span style={{fontSize:28}}>{CAT_EMOJI[c.category]||'👔'}</span>}
                  </div>
                  <div className={styles.clothName}>{c.name}</div>
                  <div className={styles.clothCat}>{c.category} · {c.temp_min}~{c.temp_max}°C</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 설정 탭 */}
      {tab === 'settings' && (
        <div className={styles.page}>
          <div className={styles.sectionTitle}>설정</div>
          <div className={styles.card}>
            <div className={styles.cardTitle}>내 정보</div>
            {[
              {label:'집 지역', sub:'날씨 조회 기준', key:'home_city', placeholder:'예: 성남시'},
            ].map(({label,sub,key,placeholder}) => (
              <div key={key} className={styles.settingRow}>
                <div className={styles.settingLabel}>{label}<span>{sub}</span></div>
                <input type="text" value={settings[key]||''} onChange={e=>setSettings({...settings,[key]:e.target.value})} placeholder={placeholder} className={styles.settingInput}/>
              </div>
            ))}
            <div className={styles.settingRow}>
              <div className={styles.settingLabel}>추위 민감도<span>체감온도 보정</span></div>
              <select value={settings.cold_sensitivity||0} onChange={e=>setSettings({...settings,cold_sensitivity:parseInt(e.target.value)})} className={styles.timeSelect}>
                <option value={-3}>추위 많이 탐 (-3°C)</option>
                <option value={-1}>약간 추위 탐 (-1°C)</option>
                <option value={0}>보통</option>
                <option value={1}>더위 탐 (+1°C)</option>
                <option value={3}>더위 많이 탐 (+3°C)</option>
              </select>
            </div>
            <button className={`${styles.btn} ${styles.btnPrimary} ${styles.btnFull}`} style={{marginTop:12}} onClick={saveSettings}>저장</button>
          </div>
          <div className={styles.card}>
            <div className={styles.cardTitle}>데이터</div>
            <div className={styles.settingRow}>
              <div className={styles.settingLabel}>등록된 옷<span>{clothes.length}개</span></div>
              <button className={`${styles.btn} ${styles.btnSm}`} onClick={()=>{if(confirm('초기화?')){setClothes([]);LS.set('clothes',[]);}}}>초기화</button>
            </div>
          </div>
        </div>
      )}

      {/* 옷 추가 모달 */}
      {modalOpen && (
        <div className={styles.modalOverlay} onClick={e=>e.target===e.currentTarget&&setModalOpen(false)}>
          <div className={styles.modal}>
            <div className={styles.modalTitle}>옷 추가</div>
            <div className={styles.addTabs}>
              <button className={`${styles.addTab} ${addTab==='url'?styles.active:''}`} onClick={()=>setAddTab('url')}>🔗 쇼핑몰 URL</button>
              <button className={`${styles.addTab} ${addTab==='photo'?styles.active:''}`} onClick={()=>setAddTab('photo')}>📷 사진 업로드</button>
            </div>

            {addTab === 'url' && (
              <div>
                <div className={styles.urlRow}>
                  <input value={shopUrl} onChange={e=>setShopUrl(e.target.value)} placeholder="무신사, 29CM 등 상품 URL" className={styles.urlInput}/>
                  <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={fetchFromUrl} disabled={urlLoading}>
                    {urlLoading ? '...' : '가져오기'}
                  </button>
                </div>
                {fetchedImage && <img src={fetchedImage} style={{width:80,height:80,objectFit:'cover',borderRadius:8,marginBottom:10}} alt=""/>}
              </div>
            )}

            {addTab === 'photo' && (
              <div className={styles.uploadZone} onClick={()=>document.getElementById('photoInput').click()}>
                <div style={{fontSize:24,marginBottom:6,color:'var(--text-sub)'}}>📷</div>
                <div style={{fontSize:13,color:'var(--text-sub)'}}>사진 업로드하면 AI가 자동 분류해요</div>
                <input id="photoInput" type="file" accept="image/*" style={{display:'none'}} onChange={e=>e.target.files[0]&&handlePhoto(e.target.files[0])}/>
                {analyzeLoading && <div style={{display:'flex',alignItems:'center',gap:8,marginTop:10}}><div className={styles.spinner}></div><span style={{fontSize:13}}>분석 중...</span></div>}
              </div>
            )}

            {resultTags && (
              <div className={styles.resultTags}>
                <div style={{fontSize:11,color:'var(--text-sub)',marginBottom:6}}>
                  {resultTags.brand && <strong>{resultTags.brand}</strong>}{resultTags.price && ` · ${resultTags.price}`}
                </div>
                {(resultTags.colors||[]).map(t=><span key={t} className={`${styles.tag} ${styles.tagGreen}`}>{t}</span>)}
                {(resultTags.material||[]).map(t=><span key={t} className={`${styles.tag} ${styles.tagAmber}`}>{t}</span>)}
                {(resultTags.style||[]).map(t=><span key={t} className={`${styles.tag} ${styles.tagBlue}`}>{t}</span>)}
                {(resultTags.temp_min||resultTags.temp_max) && <span className={`${styles.tag} ${styles.tagPurple}`}>{resultTags.temp_min||'?'}~{resultTags.temp_max||'?'}°C</span>}
              </div>
            )}

            <div style={{marginTop:12}}>
              {[{label:'옷 이름', key:'name', placeholder:'예: 그레이 가디건'},{label:'스타일', key:'style', placeholder:'예: 미니멀, 캐주얼'},{label:'색상', key:'color', placeholder:'예: 라이트 그레이'}].map(({label,key,placeholder})=>(
                <div key={key} className={styles.formRow}>
                  <div className={styles.formLabel}>{label}</div>
                  <input value={clothForm[key]} onChange={e=>setClothForm({...clothForm,[key]:e.target.value})} placeholder={placeholder} className={styles.formInput}/>
                </div>
              ))}
              <div className={styles.formRow}>
                <div className={styles.formLabel}>카테고리</div>
                <select value={clothForm.category} onChange={e=>setClothForm({...clothForm,category:e.target.value})} className={styles.formInput}>
                  {['아우터','상의','하의','원피스','신발','액세서리'].map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                {[{label:'최저 온도 (°C)', key:'temp_min', placeholder:'10'},{label:'최고 온도 (°C)', key:'temp_max', placeholder:'18'}].map(({label,key,placeholder})=>(
                  <div key={key} className={styles.formRow}>
                    <div className={styles.formLabel}>{label}</div>
                    <input value={clothForm[key]} onChange={e=>setClothForm({...clothForm,[key]:e.target.value})} placeholder={placeholder} className={styles.formInput}/>
                  </div>
                ))}
              </div>
            </div>
            <div style={{display:'flex',gap:8,marginTop:16}}>
              <button className={`${styles.btn} ${styles.btnFull}`} onClick={()=>setModalOpen(false)}>취소</button>
              <button className={`${styles.btn} ${styles.btnPrimary} ${styles.btnFull}`} onClick={saveCloth}>저장</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
    </>
  );
}
