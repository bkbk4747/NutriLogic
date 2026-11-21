// ============================================================================
// app.js - 화면 그리기와 버튼 동작 (C++ main.cpp의 메뉴 역할)
//
//  C++ 메뉴                       →  웹 화면
//  1. 내 프로필 (보기/수정/삭제)   →  [내 프로필] 탭 + 처음 실행 시 프로필 입력 팝업
//  2. 음식 목록 검색               →  [오늘] 검색창, [식단 기록] 음식 검색
//  3. 오늘 먹은 식단 기록하기       →  음식을 고르면 섭취량 팝업 (Enter = 1회 제공량)
//  4. 오늘 먹은 식단 분석하기       →  [오늘] 칼로리 링 + 탄단지 막대 (항상 보임)
//  5. 식단 직접 입력하여 기록       →  [식단 기록] 직접 입력
//  6. 지난 기록 보기 (최근 7일)     →  [오늘] 7일 그래프 + [지난 기록] 30일
//  기록 직후 x = 방금 기록 취소     →  알림의 [되돌리기] 버튼
// ============================================================================

// ----- 프로그램 상태 -----
const db = new FoodDatabase(BUILTIN_FOODS);
const favorites = new Favorites();
let profile = UserProfile.load();
let today = DateUtil.today();
let selectedDate = today;        // [오늘] 탭에서 보고 있는 날짜 (지난 날짜 기록 수정 가능)
let log = DailyLog.load(selectedDate);
let historyPick = null;          // [지난 기록]에서 고른 날짜

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const fmt = n => Math.round(n).toLocaleString('ko-KR');
const fmt1 = n => (Math.round(n * 10) / 10).toLocaleString('ko-KR');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 음식 이름 → 이모지 (시안의 음식 사진 대신). 위에서부터 먼저 맞는 것을 쓴다.
const EMOJI_RULES = [
  [/샌드위치|서브웨이/, '🥪'], [/햄버거|버거|맘스터치/, '🍔'],
  [/치킨|닭가슴|닭다리|닭갈비|닭볶음/, '🍗'], [/김치|깍두기/, '🥬'], [/후라이|달걀말이|달걀찜/, '🍳'], [/달걀|계란/, '🥚'],
  [/삼계탕|갈비탕|설렁탕|육개장|미역국|떡국|찌개|국$|탕$/, '🍲'], [/김밥/, '🍙'], [/콩국수|국수|라면|자장면|짜장|짬뽕|냉면|칼국수|쫄면|우동/, '🍜'],
  [/카레|비빔밥|볶음밥|오므라이스|덮밥/, '🍛'], [/밥$|쌀밥/, '🍚'], [/연어|고등어|광어|멸치|참치|생선/, '🐟'], [/새우/, '🦐'], [/오징어/, '🦑'],
  [/소고기|불고기|우둔|스테이크/, '🥩'], [/삼겹|제육|족발|돼지|등심|보쌈/, '🥓'], [/돈가스/, '🍖'], [/떡볶이/, '🌶️'], [/순대/, '🌭'], [/만두/, '🥟'],
  [/햄버거|버거|맘스터치/, '🍔'], [/피자/, '🍕'], [/샌드위치|서브웨이/, '🥪'], [/감자튀김/, '🍟'], [/샐러드/, '🥗'], [/나물|양배추|잡채/, '🥬'],
  [/브로콜리/, '🥦'], [/바나나/, '🍌'], [/고구마/, '🍠'], [/감자/, '🥔'], [/오트밀|시리얼/, '🥣'], [/요거트|우유|라떼/, '🥛'], [/두부/, '🧈'],
  [/아몬드|호두|땅콩|견과/, '🥜'], [/보충제|프로틴|쉐이크/, '🥤'], [/식빵|빵|베이글/, '🍞'], [/사과/, '🍎'], [/토마토/, '🍅'], [/당근/, '🥕'],
  [/귤|오렌지|단감|감$/, '🍊'], [/딸기/, '🍓'], [/포도/, '🍇'], [/블루베리/, '🫐'], [/키위/, '🥝'], [/아보카도/, '🥑'], [/^배$|배\(/, '🍐'], [/수박/, '🍉'],
  [/커피|아메리카노/, '☕'],
];
function emojiOf(name) {
  for (const [re, e] of EMOJI_RULES) if (re.test(name)) return e;
  return '🍽️';
}

// ============================================================================
// 공통: 알림(토스트), 팝업(모달)
// ============================================================================
function toast(message, { undo = null, error = false } = {}) {
  const el = document.createElement('div');
  el.className = 'toast' + (error ? ' err' : '');
  el.innerHTML = `<span>${esc(message)}</span>`;
  if (undo) {
    const btn = document.createElement('button');
    btn.textContent = '되돌리기';
    btn.onclick = () => { el.remove(); undo(); };
    el.appendChild(btn);
  }
  const area = $('#toastArea');
  area.appendChild(el);
  while (area.children.length > 2) area.firstElementChild.remove();   // 알림은 최근 2개만
  setTimeout(() => el.remove(), undo ? 6000 : 3000);
}

// 무엇을 하든 예외가 나면 알림으로 보여 주고 프로그램은 계속 돈다 (C++ main의 try-catch와 같은 역할)
function safely(fn) {
  return (...args) => {
    try { return fn(...args); }
    catch (e) { toast(e.message || String(e), { error: true }); }
  };
}

let modalLocked = false;   // 프로필이 없을 때는 팝업을 닫을 수 없게 한다
function openModal(html, { locked = false } = {}) {
  modalLocked = locked;
  $('#modal').innerHTML = html;
  $('#modalBack').hidden = false;
  const first = $('#modal [autofocus]') || $('#modal input, #modal button');
  if (first) setTimeout(() => first.focus(), 30);
}
function closeModal() {
  if (modalLocked) return;
  $('#modalBack').hidden = true;
  $('#modal').innerHTML = '';
}
$('#modalBack').addEventListener('click', e => { if (e.target.id === 'modalBack') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modalBack').hidden) closeModal(); });

function mealPickHtml(selected) {
  return MEALS.map(m => `<button type="button" data-meal="${m.id}" class="${m.id === selected ? 'on' : ''}">${m.name}</button>`).join('');
}
function bindMealPick(root) {
  root.addEventListener('click', e => {
    const b = e.target.closest('button[data-meal]');
    if (!b) return;
    $$('button', root).forEach(x => x.classList.toggle('on', x === b));
  });
}
const pickedMeal = root => ($('button.on', root) || {}).dataset?.meal || guessMeal();

// ============================================================================
// 탭 이동 (#today, #log, #fav, #history, #profile)
// ============================================================================
const TABS = ['today', 'log', 'fav', 'history', 'profile'];
function currentTab() {
  const t = location.hash.slice(1);
  return TABS.includes(t) ? t : 'today';
}
function showTab() {
  const tab = currentTab();
  $$('.view').forEach(v => { v.hidden = v.dataset.view !== tab; });
  $$('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
  render();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', showTab);

// ============================================================================
// 날짜 바꾸기
// ============================================================================
function setDate(date) {
  if (date > today) date = today;     // 미래에는 기록하지 않는다
  selectedDate = date;
  log = DailyLog.load(selectedDate);
  render();
}
// 자정이 지나면 날짜를 바꿔 준다 (C++: 메뉴 고를 때마다 날짜 파일 다시 확인)
function checkMidnight() {
  const now = DateUtil.today();
  if (now === today) return;
  const wasToday = selectedDate === today;
  today = now;
  if (wasToday) setDate(today); else render();
}
setInterval(checkMidnight, 30 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkMidnight(); });

const dateWord = () => selectedDate === today ? '오늘' : DateUtil.label(selectedDate);

// ============================================================================
// 기록 추가 / 수정 / 삭제 / 되돌리기
// ============================================================================
function addRecord({ name, per100g, grams, key, meal, source }) {
  checkMidnight();
  const item = log.add(new FoodItem({ name, per100g, grams, key, meal, source }));
  render();
  const n = item.getNutrition();
  toast(`${item.name} ${fmt(grams)}g 기록 (${fmt(n.kcal)}kcal)`, {
    undo: safely(() => { log.remove(item.id); render(); toast('방금 기록을 취소했습니다.'); }),
  });
}
function deleteRecord(id) {
  const { item, index } = log.remove(id);
  render();
  toast(`${item.name} 기록을 삭제했습니다.`, { undo: safely(() => { log.insertAt(item, index); render(); }) });
}

// 섭취량 입력 팝업 - 그냥 Enter를 누르면 1회 제공량 (C++ readGrams와 같음)
function openAddModal(food) {
  const serving = food.servingG;
  openModal(`
    <form id="addForm" novalidate>
      <div class="m-top"><span class="emoji">${emojiOf(food.name)}</span>
        <div><h3>${esc(food.name)}</h3>
        <p class="muted small">100g당 ${fmt(food.per100g.kcal)}kcal · 탄 ${fmt1(food.per100g.carb)}g · 단 ${fmt1(food.per100g.protein)}g · 지 ${fmt1(food.per100g.fat)}g</p></div>
      </div>
      <label class="field">먹은 양 (g) · 1회 제공량 ${fmt(serving)}g
        <input name="grams" type="number" inputmode="decimal" min="1" max="3000" step="any" value="${+serving.toFixed(1)}" autofocus>
      </label>
      <div class="quick-g">${[0.5, 1, 1.5, 2].map(r => `<button type="button" data-g="${serving * r}">${r}회 (${fmt(serving * r)}g)</button>`).join('')}</div>
      <div class="field" style="margin-top:14px">끼니<div class="meal-pick">${mealPickHtml(guessMeal())}</div></div>
      <div class="preview" id="addPreview"></div>
      <p class="error" id="addError"></p>
      <p class="muted small">${esc(dateWord())} 기록에 추가됩니다.</p>
      <div class="actions"><button type="button" class="btn ghost" data-close>취소</button><button class="btn primary">기록하기</button></div>
    </form>`);
  const form = $('#addForm');
  bindMealPick($('.meal-pick', form));
  const update = () => {
    const g = Number(form.grams.value);
    const n = food.per100g.times(g > 0 ? g / 100 : 0);
    $('#addPreview').innerHTML = previewHtml(n);
  };
  form.grams.addEventListener('input', update);
  $('.quick-g', form).addEventListener('click', e => {
    const b = e.target.closest('button[data-g]');
    if (b) { form.grams.value = +Number(b.dataset.g).toFixed(1); update(); }
  });
  update();
  form.addEventListener('submit', e => {
    e.preventDefault();
    try {
      const text = form.grams.value.trim();
      const grams = text === '' ? serving : checkNumber(text, 1, 3000, '섭취량');
      addRecord({ name: food.name, per100g: food.per100g, grams, key: food.key, meal: pickedMeal($('.meal-pick', form)),
                  source: food.key.startsWith('db:') ? 'db' : food.key.startsWith('custom:') ? 'custom' : 'manual' });
      closeModal();
    } catch (err) { $('#addError').textContent = err.message; }
  });
}
function previewHtml(n) {
  return `<div><b>${fmt(n.kcal)}</b><span>kcal</span></div><div><b>${fmt1(n.carb)}</b><span>탄수화물 g</span></div>
          <div><b>${fmt1(n.protein)}</b><span>단백질 g</span></div><div><b>${fmt1(n.fat)}</b><span>지방 g</span></div>`;
}

// 기록 수정 팝업 (웹 추가 기능): 섭취량과 끼니를 바꾼다
function openEditModal(id) {
  const item = log.find(id);
  if (!item) return;
  openModal(`
    <form id="editForm" novalidate>
      <div class="m-top"><span class="emoji">${emojiOf(item.name)}</span><div><h3>${esc(item.name)} 수정</h3>
        <p class="muted small">${esc(DateUtil.label(log.date))} 기록</p></div></div>
      <label class="field">먹은 양 (g)<input name="grams" type="number" inputmode="decimal" min="1" max="3000" step="any" value="${+item.grams.toFixed(1)}" autofocus></label>
      <div class="field" style="margin-top:14px">끼니<div class="meal-pick">${mealPickHtml(item.meal)}</div></div>
      <div class="preview" id="editPreview"></div>
      <p class="error" id="editError"></p>
      <div class="actions"><button type="button" class="btn ghost" data-close>취소</button><button class="btn primary">저장</button></div>
    </form>`);
  const form = $('#editForm');
  bindMealPick($('.meal-pick', form));
  const update = () => { const g = Number(form.grams.value); $('#editPreview').innerHTML = previewHtml(item.per100g.times(g > 0 ? g / 100 : 0)); };
  form.grams.addEventListener('input', update);
  update();
  form.addEventListener('submit', e => {
    e.preventDefault();
    try {
      log.update(id, { grams: checkNumber(form.grams.value, 1, 3000, '섭취량'), meal: pickedMeal($('.meal-pick', form)) });
      closeModal(); render(); toast('기록을 수정했습니다.');
    } catch (err) { $('#editError').textContent = err.message; }
  });
}

// ============================================================================
// 프로필 입력 팝업 (처음 실행 / 수정 / 삭제 후 새로 입력)
//  입력하는 동안 목표 칼로리를 바로 계산해 보여 준다 (AI로 개선한 부분)
// ============================================================================
function openProfileModal({ required = false } = {}) {
  const p = profile || new UserProfile({ isMale: true, age: '', height: '', weight: '', activity: 1, goal: 1 });
  const seg = (name, list, value) => `<div class="seg2" data-name="${name}">${list.map((t, i) =>
    `<button type="button" data-v="${i}" class="${i === value ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  openModal(`
    <form id="profileForm" novalidate>
      <h3>${required ? '처음 오셨네요! 프로필을 만들어 주세요' : '프로필 수정'}</h3>
      <p class="muted small">${required ? '맞춤 영양 목표를 계산하려면 신체 정보가 필요해요. 이 정보는 이 브라우저에만 저장됩니다.' : '바꾼 값으로 하루 목표가 다시 계산됩니다. 식단 기록은 그대로 남아요.'}</p>
      <div class="field" style="margin-top:12px">성별${seg('isMale', ['남성', '여성'], p.isMale ? 0 : 1)}</div>
      <div class="field-grid" style="grid-template-columns:repeat(3,minmax(0,1fr));margin:12px 0">
        <label class="field">나이 (19~100)<input name="age" type="number" inputmode="numeric" min="19" max="100" value="${p.age}" ${required ? 'autofocus' : ''}></label>
        <label class="field">키 (cm)<input name="height" type="number" inputmode="decimal" min="100" max="250" step="any" value="${p.height}"></label>
        <label class="field">체중 (kg)<input name="weight" type="number" inputmode="decimal" min="30" max="300" step="any" value="${p.weight}"></label>
      </div>
      <div class="field">운동 횟수${seg('activity', ACTIVITY_NAME, p.activity)}</div>
      <div class="field" style="margin-top:12px">운동 목표${seg('goal', GOAL_NAME, p.goal)}</div>
      <div class="target-preview" id="targetPreview"></div>
      <p class="error" id="profileError"></p>
      <div class="actions">${required ? '' : '<button type="button" class="btn ghost" data-close>취소</button>'}<button class="btn primary">저장</button></div>
    </form>`, { locked: required });
  const form = $('#profileForm');
  $$('.seg2', form).forEach(bindMealPickLike);
  const read = () => new UserProfile({
    isMale: $('[data-name=isMale] .on', form).dataset.v === '0',
    age: Number(form.age.value), height: Number(form.height.value), weight: Number(form.weight.value),
    activity: Number($('[data-name=activity] .on', form).dataset.v), goal: Number($('[data-name=goal] .on', form).dataset.v),
  });
  const preview = () => {
    const box = $('#targetPreview');
    if (!box) return;   // 팝업이 이미 닫혔으면 할 일 없음
    try {
      const t = read().validate().calcTarget();
      box.innerHTML = `하루 목표 <b>${fmt(t.kcal)} kcal</b> · 탄 ${fmt(t.carb)}g · 단 ${fmt(t.protein)}g · 지 ${fmt(t.fat)}g`;
    } catch (e) {
      box.innerHTML = `<span class="muted">값을 모두 넣으면 목표 칼로리가 여기에 바로 계산돼요.</span>`;
    }
  };
  form.addEventListener('input', preview);
  form.addEventListener('click', () => setTimeout(preview));
  preview();
  form.addEventListener('submit', e => {
    e.preventDefault();
    try {
      // 숫자 칸이 비었는지 먼저 확인 (Number('')는 0이 되므로)
      if (!form.age.value || !form.height.value || !form.weight.value) throw new Error('나이, 키, 체중을 모두 입력해 주세요.');
      const input = read().validate();   // 임시 객체로 검사 → 통과해야 반영 (C++ setupProfile과 같음)
      input.save();
      profile = input;
      modalLocked = false;
      closeModal();
      render();
      toast(`프로필을 저장했습니다. 하루 목표 ${fmt(profile.calcTarget().kcal)}kcal`);
    } catch (err) { $('#profileError').textContent = err.message; }
  });
}
function bindMealPickLike(root) {
  root.addEventListener('click', e => {
    const b = e.target.closest('button[data-v]');
    if (b) $$('button', root).forEach(x => x.classList.toggle('on', x === b));
  });
}

function confirmModal({ title, body, ok, danger = false, onOk }) {
  openModal(`<h3>${esc(title)}</h3><p class="muted">${body}</p>
    <div class="actions"><button class="btn ghost" data-close>취소</button><button class="btn ${danger ? 'danger' : 'primary'}" id="confirmOk">${esc(ok)}</button></div>`);
  $('#confirmOk').onclick = safely(() => { closeModal(); onOk(); });
}

// ============================================================================
// 화면 그리기
// ============================================================================
function render() {
  renderHeader();
  if (!profile) return;
  const tab = currentTab();
  if (tab === 'today') renderToday();
  if (tab === 'log') renderLog();
  if (tab === 'fav') renderFav();
  if (tab === 'history') renderHistory();
  if (tab === 'profile') renderProfile();
}

function renderHeader() {
  $('#profileChipText').textContent = profile ? `${GOAL_NAME[profile.goal]} · ${fmt1(profile.weight)}kg` : '프로필 없음';
}

// 하루 합계 목록 (그래프용). 기록 없는 날은 null
function dayTotals(endDate, days) {
  const list = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = DateUtil.addDays(endDate, -i);
    const dl = date === log.date ? log : DailyLog.load(date);
    list.push({ date, total: dl.isEmpty() ? null : dl.getTotal(), count: dl.count() });
  }
  return list;
}

// ----- [오늘] -----
function renderToday() {
  const target = profile.calcTarget();
  const eaten = log.getTotal();
  $('#dateLabel').textContent = DateUtil.label(selectedDate);
  $('#nextDayBtn').disabled = selectedDate >= today;
  $('#todayPill').textContent = selectedDate === today ? '오늘' : '오늘로';
  $('#todayPill').classList.toggle('soft', selectedDate === today);

  // 칼로리 링
  const ratio = eaten.kcal / target.kcal;
  const R = 92, C = 2 * Math.PI * R;
  const over = ratio > 1;
  $('#ring').className = 'ring' + (over ? ' over' : '');
  $('#ring').innerHTML = `
    <svg viewBox="0 0 220 220"><circle class="track" cx="110" cy="110" r="${R}" />
      <circle class="value" cx="110" cy="110" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - Math.min(ratio, 1))}" /></svg>
    <div class="ring-text">${fmt(eaten.kcal)} /<small>${fmt(target.kcal)} kcal</small></div>`;
  const remain = target.kcal - eaten.kcal;
  $('.remain').classList.toggle('over', remain < 0);
  $('#remainTitle').textContent = remain >= 0 ? '남은 칼로리' : '초과한 칼로리';
  $('#remainKcal').textContent = `${fmt(Math.abs(remain))} kcal`;

  // 탄단지 막대 (C++ printCompare: 목표·섭취·달성률·부족/초과)
  const macro = (label, icon, color, bg, t, e) => {
    const pct = t > 0 ? e / t * 100 : 0;
    const diff = t - e;
    return `<div class="macro">
      <span class="m-ico" style="background:${bg};color:${color}">${icon}</span><b>${label}</b>
      <div><div class="m-num">${fmt(e)} / ${fmt(t)} g<em>${diff >= 0 ? '부족' : '초과'} ${fmt(Math.abs(diff))}g</em></div>
        <div class="track-bar"><i style="width:${Math.min(pct, 100)}%;background:${pct > 110 ? '#c0392b' : color}"></i></div></div>
      <span class="pct">${fmt(pct)}%</span></div>`;
  };
  $('#macroBars').innerHTML =
    macro('탄수화물', '🌾', '#df8f7c', '#fbe9e4', target.carb, eaten.carb) +
    macro('단백질', '💪', '#6f95ba', '#e6eef6', target.protein, eaten.protein) +
    macro('지방', '💧', '#e3a660', '#fdf0e1', target.fat, eaten.fat);

  // 최근 7일 그래프
  $('#targetPill').textContent = `목표 ${fmt(target.kcal)} kcal`;
  $('#weekChart').innerHTML = barChart(dayTotals(selectedDate, 7), target.kcal, selectedDate, true);

  renderRecommend(target, eaten);
  renderFavStrip();
  renderTodayList();
}

// 막대 그래프 (7일·30일 공통)
function barChart(days, targetKcal, selected, showValues) {
  const maxVal = Math.max(targetKcal, ...days.map(d => d.total ? d.total.kcal : 0));
  const top = Math.ceil(maxVal * 1.08 / 500) * 500;
  const steps = top / 500 > 6 ? 1000 : 500;
  const ticks = [];
  for (let v = 0; v <= top; v += steps) ticks.push(v);
  const axisTop = ticks[ticks.length - 1];
  const bars = days.map(d => {
    const k = d.total ? d.total.kcal : 0;
    const cls = ['col-bar', !d.total ? 'empty' : '', d.total && k > targetKcal ? 'over' : '', d.date === selected ? 'sel' : ''].join(' ');
    return `<button class="${cls}" data-date="${d.date}" title="${DateUtil.label(d.date)} ${d.total ? fmt(k) + 'kcal' : '기록 없음'}">
      <span class="val">${d.total ? fmt(k) : (showValues ? '-' : '기록 없음')}</span>
      <span class="bar" style="height:${k / axisTop * 100}%"></span>
      <span class="day">${DateUtil.short(d.date)}${showValues ? '<br>(' + DateUtil.weekday(d.date) + ')' : ''}</span></button>`;
  }).join('');
  return `<div class="axis">${ticks.map(t => `<span>${fmt(t)}</span>`).join('')}</div>
    <div class="target-line" style="bottom:calc(50px + (100% - 76px) * ${targetKcal / axisTop})"></div>${bars}`;
}

function renderRecommend(target, eaten) {
  const card = $('#recommendCard');
  if (selectedDate !== today) {
    card.innerHTML = `<h3>💡 다음 식사 추천</h3><p class="why">추천은 오늘 날짜에서만 보여요. 지금은 ${esc(DateUtil.label(selectedDate))} 기록을 보고 있어요.</p>`;
    return;
  }
  const rec = recommendNext(db, target, eaten, new Set(log.items.map(i => i.key)));
  card.innerHTML = `
    <h3>💡 다음 식사 추천 <span class="tag">${MEAL_NAME[rec.meal]}</span></h3>
    <p class="why">${esc(rec.message)}</p>
    <div class="rec-list">${rec.picks.map(({ food, n }) => `
      <div class="rec"><span class="emoji">${emojiOf(food.name)}</span>
        <div class="r-body"><div class="r-name">${esc(food.name)} <span class="muted small">${fmt(food.servingG)}g</span></div>
          <div class="r-sub">${fmt(n.kcal)}kcal · 탄 ${fmt(n.carb)}g · 단 ${fmt(n.protein)}g · 지 ${fmt(n.fat)}g</div></div>
        <button class="add-btn" data-action="pick-food" data-key="${food.key}" aria-label="${esc(food.name)} 기록">＋</button></div>`).join('')}
    </div>`;
}

function renderFavStrip() {
  const list = favorites.list.slice(0, 4);
  $('#favStrip').innerHTML = list.length ? list.map(f => `
    <div class="fav-card" data-action="pick-fav" data-key="${esc(f.key)}" title="눌러서 양을 정해 기록">
      <div class="f-top"><span class="emoji">${emojiOf(f.name)}</span><span class="f-star">★</span>
      <button class="add-btn" data-action="quick-fav" data-key="${esc(f.key)}" aria-label="${esc(f.name)} 바로 추가">＋</button></div>
      <div class="f-body"><div class="f-name">${esc(f.name)}</div><div class="f-sub">${fmt(f.servingG)}g · ${fmt(f.per100g.kcal * f.servingG / 100)}kcal</div></div>
    </div>`).join('')
    : `<div class="empty-box">음식 옆 ☆를 눌러 즐겨찾기를 만들면 여기서 한 번에 추가할 수 있어요.</div>`;
}

function renderTodayList() {
  const total = log.getTotal();
  $('#listTitle').textContent = selectedDate === today ? '오늘의 식단 기록' : `${DateUtil.short(selectedDate)} 식단 기록`;
  $('#listSummary').textContent = `총 ${log.count()}개 · ${fmt(total.kcal)} kcal`;
  if (log.isEmpty()) {
    $('#todayList').innerHTML = `<div class="empty-box">아직 기록한 음식이 없습니다. 위 검색창에서 음식을 찾아 기록해 보세요.</div>`;
    return;
  }
  $('#todayList').innerHTML = log.byMeal().map(group => {
    const sum = group.items.reduce((t, i) => t.plus(i.getNutrition()), new Nutrition());
    return `<div class="meal-group"><div class="meal-head">${group.name}<span>${fmt(sum.kcal)} kcal</span></div>
      ${group.items.map(item => {
        const n = item.getNutrition();
        const on = favorites.has(item.key);
        return `<div class="entry">
          <span class="thumb">${emojiOf(item.name)}</span>
          <button class="star ${on ? 'on' : ''}" data-action="star-item" data-id="${item.id}" aria-label="즐겨찾기 ${on ? '해제' : '추가'}">${on ? '★' : '☆'}</button>
          <div class="e-info"><div class="e-name">${esc(item.name)}${item.source === 'manual' ? '<span class="tag mine">직접 입력</span>' : ''}</div>
            <div class="e-macro">탄 ${fmt1(n.carb)}g · 단 ${fmt1(n.protein)}g · 지 ${fmt1(n.fat)}g</div></div>
          <span class="e-g">${fmt1(item.grams)} g</span>
          <span class="e-kcal">${fmt(n.kcal)} kcal</span>
          <div class="e-actions">
            <button class="sq-btn" data-action="edit" data-id="${item.id}" aria-label="수정"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4" /></svg></button>
            <button class="sq-btn del" data-action="delete" data-id="${item.id}" aria-label="삭제"><svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6" /></svg></button>
          </div></div>`;
      }).join('')}</div>`;
  }).join('');
}

// [오늘] 검색창: 입력하면 바로 아래에 결과 (Enter/버튼 → 식단 기록 탭으로)
let quickIndex = -1;
function renderQuickResults() {
  const box = $('#quickResults');
  const k = $('#quickSearch').value.trim();
  if (!k) { box.hidden = true; return; }
  const found = db.search(k).slice(0, 7);
  quickIndex = -1;
  box.hidden = false;
  box.innerHTML = found.length ? found.map(f => `<button type="button" data-action="pick-food" data-key="${f.key}">
      <span style="font-size:22px">${emojiOf(f.name)}</span><b>${esc(f.name)}</b>
      <span class="dd-sub">1회 ${fmt(f.servingG)}g · ${fmt(f.per100g.kcal * f.servingG / 100)}kcal</span></button>`).join('')
    : `<div class="dd-empty">'${esc(k)}'(이)가 들어간 음식이 없습니다. <a href="#log" data-action="go-manual">직접 입력하기 ›</a></div>`;
}
$('#quickSearch').addEventListener('input', renderQuickResults);
$('#quickSearch').addEventListener('keydown', e => {
  const items = $$('#quickResults button');
  if (!items.length || !['ArrowDown', 'ArrowUp'].includes(e.key)) return;
  e.preventDefault();
  quickIndex = (quickIndex + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
  items.forEach((b, i) => b.classList.toggle('active', i === quickIndex));
});
$('#quickSearchForm').addEventListener('submit', e => {
  e.preventDefault();
  const active = $('#quickResults button.active');
  if (active) { active.click(); return; }
  $('#foodSearch').value = $('#quickSearch').value;
  $('#quickResults').hidden = true;
  logMode = 'search';
  location.hash = '#log';
  if (currentTab() === 'log') render();
  setTimeout(() => $('#foodSearch').focus(), 50);
});
document.addEventListener('click', e => { if (!e.target.closest('#quickSearchForm')) $('#quickResults').hidden = true; });

// ----- [식단 기록] -----
let logMode = 'search';
function renderLog() {
  $('#logDateNote').textContent = dateWord();
  $$('#logModeTabs button').forEach(b => b.classList.toggle('on', b.dataset.mode === logMode));
  $$('[data-mode-panel]').forEach(p => { p.hidden = p.dataset.modePanel !== logMode; });
  if (logMode === 'search') renderFoodResults();
  if (logMode === 'addfood') renderCustomFoods();
  if (logMode === 'manual') { const pick = $('#manualForm .meal-pick'); if (!$('button.on', pick)) pick.innerHTML = mealPickHtml(guessMeal()); }
}
function foodRowHtml(f, { removable = false } = {}) {
  const on = favorites.has(f.key);
  return `<div class="food-row"><span class="emoji">${emojiOf(f.name)}</span>
    <div class="r-body"><div class="r-name">${esc(f.name)}${f.custom ? '<span class="tag mine">내 음식</span>' : ''}</div>
      <div class="r-sub">100g당 ${fmt(f.per100g.kcal)}kcal · 탄 ${fmt1(f.per100g.carb)} · 단 ${fmt1(f.per100g.protein)} · 지 ${fmt1(f.per100g.fat)}g · 1회 ${fmt(f.servingG)}g</div></div>
    <button class="star ${on ? 'on' : ''}" data-action="star-food" data-key="${f.key}" aria-label="즐겨찾기">${on ? '★' : '☆'}</button>
    ${removable ? `<button class="btn danger" data-action="remove-custom" data-id="${f.id}">삭제</button>`
                : `<button class="btn primary" data-action="pick-food" data-key="${f.key}">기록</button>`}</div>`;
}
function renderFoodResults() {
  const k = $('#foodSearch').value.trim();
  const found = db.search(k);
  $('#searchCount').textContent = k ? `'${k}' 검색 결과 ${found.length}개` : `전체 ${found.length}개 (기본 ${db.builtIn.length}개 + 내가 추가한 ${db.custom.length}개)`;
  $('#foodResults').innerHTML = found.length ? found.map(f => foodRowHtml(f)).join('')
    : `<div class="no-result">'${esc(k)}'(이)가 들어간 음식이 없습니다.<br>목록에 없는 음식은 직접 입력해서 기록할 수 있어요.<br>
       <button class="btn primary" data-action="go-manual">직접 입력하기</button></div>`;
}
$('#foodSearch').addEventListener('input', () => renderFoodResults());
$('#logModeTabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-mode]');
  if (b) { logMode = b.dataset.mode; renderLog(); }
});
function renderCustomFoods() {
  $('#customFoodList').innerHTML = db.custom.length ? db.custom.map(f => foodRowHtml(f, { removable: true })).join('')
    : `<div class="empty-box">아직 추가한 음식이 없어요.</div>`;
}

// 직접 입력 (C++ 메뉴 5): 먹은 양 기준 값 → 100g 기준으로 바꿔 저장
bindMealPick($('#manualForm .meal-pick'));
function readManual(form) {
  const v = field => form.elements[field].value;
  const name = v('name').trim().replace(/,/g, ' ');
  if (!name) throw new Error('음식 이름을 입력해 주세요.');
  const grams = checkNumber(v('grams'), 1, 3000, '먹은 양');
  const eaten = new Nutrition(checkNumber(v('kcal'), 0, 5000, '칼로리'), checkNumber(v('carb') || 0, 0, 1000, '탄수화물'),
                              checkNumber(v('protein') || 0, 0, 1000, '단백질'), checkNumber(v('fat') || 0, 0, 1000, '지방'));
  if (eaten.carb + eaten.protein + eaten.fat > grams) throw new Error('탄수화물·단백질·지방을 합친 무게가 먹은 양보다 클 수 없어요.');
  return { name, grams, eaten, per100g: eaten.times(100 / grams) };
}
// 입력값 점검 힌트: 탄단지로 계산한 열량과 입력한 열량 차이가 크면 알려 준다 (AI 제안)
$('#manualForm').addEventListener('input', () => {
  const f = $('#manualForm');
  const kcal = Number(f.kcal.value), c = Number(f.carb.value) || 0, p = Number(f.protein.value) || 0, fat = Number(f.fat.value) || 0;
  const calc = c * 4 + p * 4 + fat * 9;
  $('#manualHint').textContent = kcal > 0 && calc > 0 && Math.abs(calc - kcal) / kcal > 0.25
    ? `참고: 탄단지로 계산하면 약 ${fmt(calc)}kcal예요. 입력한 ${fmt(kcal)}kcal와 차이가 커요. 숫자를 한 번 더 확인해 보세요.` : '';
});
$('#manualForm').addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  try {
    const { name, grams, per100g } = readManual(form);
    const key = 'my:' + name;
    addRecord({ name, per100g, grams, key, meal: pickedMeal($('.meal-pick', form)), source: 'manual' });
    if (form.favorite.checked) favorites.add({ key, name, servingG: grams, per100g });
    form.reset();
    $('#manualHint').textContent = '';
    $('#manualError').textContent = '';
    $('.meal-pick', form).innerHTML = mealPickHtml(guessMeal());
  } catch (err) { $('#manualError').textContent = err.message; }
});

// 음식 데이터 추가 (웹 추가 기능)
$('#addFoodForm').addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  try {
    const per100g = new Nutrition(checkNumber(form.kcal.value, 0, 1000, '100g당 칼로리'), checkNumber(form.carb.value || 0, 0, 100, '100g당 탄수화물'),
                                  checkNumber(form.protein.value || 0, 0, 100, '100g당 단백질'), checkNumber(form.fat.value || 0, 0, 100, '100g당 지방'));
    if (per100g.carb + per100g.protein + per100g.fat > 100) throw new Error('100g당 탄단지 합이 100g을 넘을 수 없어요.');
    const food = db.addCustom({ name: form.elements['name'].value.replace(/,/g, ' '), servingG: form.servingG.value, per100g });
    form.reset();
    $('#addFoodError').textContent = '';
    renderCustomFoods();
    toast(`'${food.name}'을(를) 음식 목록에 추가했습니다.`);
  } catch (err) { $('#addFoodError').textContent = err.message; }
});

// ----- [즐겨찾기] -----
function renderFav() {
  $('#favDateNote').textContent = dateWord();
  $('#favGrid').innerHTML = favorites.list.length ? favorites.list.map(f => {
    const n = f.per100g.times(f.servingG / 100);
    const mine = f.key.startsWith('my:');
    return `<div class="fav-item"><span class="emoji">${emojiOf(f.name)}</span>
      <div class="r-body"><div class="r-name">${esc(f.name)}${mine ? '<span class="tag mine">직접 입력</span>' : ''}</div>
        <div class="r-sub">${fmt(f.servingG)}g · ${fmt(n.kcal)}kcal · 탄 ${fmt(n.carb)} · 단 ${fmt(n.protein)} · 지 ${fmt(n.fat)}g</div></div>
      <button class="star on" data-action="unstar" data-key="${esc(f.key)}" aria-label="즐겨찾기 해제">★</button>
      <button class="sq-btn" data-action="pick-fav" data-key="${esc(f.key)}" aria-label="양 정해서 기록"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z" /></svg></button>
      <button class="add-btn" data-action="quick-fav" data-key="${esc(f.key)}" aria-label="바로 추가">＋</button></div>`;
  }).join('') : `<div class="empty-box">아직 즐겨찾기가 없어요. [식단 기록]이나 [오늘] 목록에서 음식 옆 ☆를 눌러 보세요.<br>직접 입력한 음식도 ☆로 저장할 수 있어요.</div>`;
}

// ----- [지난 기록] 30일 -----
function renderHistory() {
  const target = profile.calcTarget();
  const days = dayTotals(today, 30);
  const recorded = days.filter(d => d.total);
  const sum = recorded.reduce((t, d) => t.plus(d.total), new Nutrition());
  const avg = recorded.length ? sum.times(1 / recorded.length) : null;
  const good = recorded.filter(d => Math.abs(d.total.kcal - target.kcal) <= target.kcal * 0.1).length;
  const proteinOk = recorded.filter(d => d.total.protein >= target.protein * 0.9).length;
  $('#historyStats').innerHTML = `
    <div class="stat"><p>기록한 날</p><strong>${recorded.length}</strong><span> / 30일</span></div>
    <div class="stat"><p>하루 평균 칼로리</p><strong>${avg ? fmt(avg.kcal) : '-'}</strong><span> kcal (목표 ${fmt(target.kcal)})</span></div>
    <div class="stat"><p>목표 ±10% 안에 든 날</p><strong>${good}</strong><span>일</span></div>
    <div class="stat"><p>단백질 목표 90% 이상</p><strong>${proteinOk}</strong><span>일 (평균 ${avg ? fmt(avg.protein) : '-'}g)</span></div>`;
  if (!historyPick) historyPick = today;
  $('#monthChart').innerHTML = barChart(days, target.kcal, historyPick, false);

  const dl = historyPick === log.date ? log : DailyLog.load(historyPick);
  const t = dl.getTotal();
  $('#historyDetail').innerHTML = `
    <div class="card-head"><h3>${esc(DateUtil.label(historyPick))}${historyPick === today ? ' · 오늘' : ''}</h3>
      <button class="btn" data-action="open-day" data-date="${historyPick}">이 날짜 기록 열기 / 수정</button></div>
    ${dl.isEmpty() ? '<p class="muted">이 날은 기록이 없습니다.</p>' : `
      <p><b>${fmt(t.kcal)} kcal</b> <span class="muted">(목표의 ${fmt(t.kcal / target.kcal * 100)}%) · 탄 ${fmt(t.carb)}g · 단 ${fmt(t.protein)}g · 지 ${fmt(t.fat)}g</span></p>
      ${dl.items.map(i => `<div class="detail-row"><span>${emojiOf(i.name)} ${esc(i.name)} <span class="tag">${MEAL_NAME[i.meal]}</span></span>
        <span class="muted">${fmt1(i.grams)}g · <b style="color:var(--text)">${fmt(i.getNutrition().kcal)} kcal</b></span></div>`).join('')}`}`;
}

// ----- [내 프로필] -----
function renderProfile() {
  const p = profile, t = p.calcTarget();
  $('#profileCard').innerHTML = `
    <h3>신체 정보</h3>
    <dl class="kv"><dt>성별</dt><dd>${p.isMale ? '남성' : '여성'}</dd><dt>나이</dt><dd>${p.age}세</dd>
      <dt>키</dt><dd>${fmt1(p.height)} cm</dd><dt>체중</dt><dd>${fmt1(p.weight)} kg</dd>
      <dt>운동</dt><dd>${ACTIVITY_NAME[p.activity]}</dd><dt>목표</dt><dd>${GOAL_NAME[p.goal]}</dd></dl>
    <div class="btn-row"><button class="btn primary" data-action="edit-profile">프로필 수정</button>
      <button class="btn danger" data-action="delete-profile">프로필 삭제</button></div>`;
  $('#targetCard').innerHTML = `
    <h3>하루 영양 목표</h3>
    <div class="target-big">${fmt(t.kcal)} kcal</div>
    <dl class="kv" style="margin-top:12px"><dt>기초대사량 (BMR)</dt><dd>${fmt(p.calcBMR())} kcal</dd>
      <dt>총소비량 (TDEE)</dt><dd>${fmt(p.calcTDEE())} kcal</dd>
      <dt>탄수화물</dt><dd>${fmt(t.carb)} g</dd><dt>단백질</dt><dd>${fmt(t.protein)} g</dd><dt>지방</dt><dd>${fmt(t.fat)} g</dd></dl>
    <div class="formula"><b>계산 방법</b><br>
      ① BMR = 10×체중 + 6.25×키 − 5×나이 ${p.isMale ? '+ 5 (남성)' : '− 161 (여성)'} (Mifflin-St Jeor)<br>
      ② TDEE = BMR × 활동계수 ${ACTIVITY_FACTOR[p.activity]}<br>
      ③ 목표 = TDEE × ${GOAL_FACTOR[p.goal]} (${GOAL_NAME[p.goal]})<br>
      ④ 단백질 = 체중×1.8g · 지방 = 목표의 25%÷9 · 탄수화물 = 나머지÷4</div>`;
  const keys = Storage.allKeys();
  const days = keys.filter(k => k.startsWith('log.')).length;
  $('#storageInfo').textContent = `저장된 기록: ${days}일 · 즐겨찾기 ${favorites.list.length}개 · 추가한 음식 ${db.custom.length}개`;
}

// ----- JSON 백업 / 복원 (웹 추가 기능) -----
function backup() {
  const data = { app: 'NutriLogic', version: 2, exportedAt: new Date().toISOString(), data: {} };
  for (const key of Storage.allKeys()) data.data[key] = Storage.read(key, null);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `nutrilogic-backup-${today}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('백업 파일을 내려받았습니다.');
}
$('#restoreInput').addEventListener('change', e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = safely(() => {
    let parsed;
    try { parsed = JSON.parse(reader.result); } catch (err) { throw new Error('JSON 형식이 아닌 파일입니다.'); }
    if (!parsed || parsed.app !== 'NutriLogic' || typeof parsed.data !== 'object') throw new Error('NutriLogic 백업 파일이 아닙니다.');
    const keys = Object.keys(parsed.data).filter(k => k === 'profile' || k === 'favorites' || k === 'customFoods' || /^log\.\d{4}-\d{2}-\d{2}$/.test(k));
    const days = keys.filter(k => k.startsWith('log.')).length;
    confirmModal({
      title: '백업에서 복원할까요?',
      body: `기록 ${days}일치와 프로필·즐겨찾기를 불러옵니다. <b>지금 브라우저에 있는 기록은 백업 내용으로 바뀝니다.</b>`,
      ok: '복원하기',
      onOk: () => {
        const before = {};
        for (const k of Storage.allKeys()) before[k] = Storage.read(k, null);
        try {
          for (const k of Storage.allKeys()) Storage.remove(k);
          for (const k of keys) Storage.write(k, parsed.data[k]);
        } catch (err) {   // 중간에 실패하면 원래대로
          for (const k of Storage.allKeys()) Storage.remove(k);
          for (const [k, v] of Object.entries(before)) Storage.write(k, v);
          throw err;
        }
        location.reload();
      },
    });
  });
  reader.readAsText(file);
});

// ============================================================================
// 버튼 클릭 한곳에서 처리 (data-action)
// ============================================================================
const findFoodOrFav = key => db.findByKey(key) || favorites.get(key);

document.addEventListener('click', safely(e => {
  if (e.target.closest('[data-close]')) { closeModal(); return; }
  const bar = e.target.closest('.col-bar');
  if (bar) {
    if (bar.closest('#monthChart')) { historyPick = bar.dataset.date; renderHistory(); }
    else setDate(bar.dataset.date);
    return;
  }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, key, id, date } = el.dataset;
  switch (action) {
    case 'prev-day': setDate(DateUtil.addDays(selectedDate, -1)); break;
    case 'next-day': setDate(DateUtil.addDays(selectedDate, 1)); break;
    case 'go-today': setDate(today); break;
    case 'pick-food': { $('#quickResults').hidden = true; const f = findFoodOrFav(key); if (f) openAddModal(f); break; }
    case 'pick-fav': { e.stopPropagation(); const f = favorites.get(key); if (f) openAddModal(f); break; }
    case 'quick-fav': {
      e.stopPropagation();
      const f = favorites.get(key);
      if (f) addRecord({ name: f.name, per100g: f.per100g, grams: f.servingG, key: f.key, meal: guessMeal(),
                         source: key.startsWith('my:') ? 'manual' : key.startsWith('custom:') ? 'custom' : 'db' });
      break;
    }
    case 'star-food': {
      const f = db.findByKey(key);
      const on = favorites.toggle({ key: f.key, name: f.name, servingG: f.servingG, per100g: f.per100g });
      toast(on ? `★ '${f.name}'을(를) 즐겨찾기에 추가했습니다.` : `'${f.name}' 즐겨찾기를 해제했습니다.`);
      render();
      break;
    }
    case 'star-item': {
      const item = log.find(id);
      // 목록 음식이면 1회 제공량, 직접 입력이면 그때 먹은 양을 기본 양으로 저장
      const base = db.findByKey(item.key);
      const on = favorites.toggle({ key: item.key, name: item.name, servingG: base ? base.servingG : item.grams, per100g: item.per100g });
      toast(on ? `★ '${item.name}'을(를) 즐겨찾기에 추가했습니다.` : `'${item.name}' 즐겨찾기를 해제했습니다.`);
      render();
      break;
    }
    case 'unstar': {
      const f = favorites.get(key);
      favorites.remove(key);
      render();
      toast(`'${f.name}' 즐겨찾기를 해제했습니다.`, { undo: safely(() => { favorites.add(f); render(); }) });
      break;
    }
    case 'edit': openEditModal(id); break;
    case 'delete': deleteRecord(id); break;
    case 'go-manual': {
      e.preventDefault();
      const k = $('#quickSearch').value.trim() || $('#foodSearch').value.trim();
      logMode = 'manual';
      $('#quickResults').hidden = true;
      $('#manualForm').elements['name'].value = k;
      if (currentTab() !== 'log') location.hash = '#log'; else renderLog();
      setTimeout(() => $('#manualForm').grams.focus(), 50);
      break;
    }
    case 'remove-custom': {
      const f = db.findById(Number(id));
      confirmModal({ title: `'${f.name}' 삭제`, body: '음식 목록에서 지웁니다. 이미 기록한 식단은 그대로 남아요.', ok: '삭제', danger: true,
        onOk: () => { db.removeCustom(f.id); if (favorites.has(f.key)) favorites.remove(f.key); render(); toast('삭제했습니다.'); } });
      break;
    }
    case 'open-day': setDate(date); location.hash = '#today'; break;
    case 'edit-profile': openProfileModal(); break;
    case 'delete-profile':
      confirmModal({ title: '프로필을 삭제할까요?', body: '식단 기록은 그대로 남습니다. 목표 계산을 위해 바로 새 프로필을 입력하게 됩니다.', ok: '삭제', danger: true,
        onOk: () => { UserProfile.remove(); profile = null; renderHeader(); openProfileModal({ required: true }); } });
      break;
    case 'backup': backup(); break;
  }
}));

// ============================================================================
// 시작: 프로필이 없으면 먼저 만든다 (C++ requireProfile)
// ============================================================================
showTab();
if (!profile) openProfileModal({ required: true });
