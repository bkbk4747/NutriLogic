// ============================================================================
// models.js
// 1주차 C++ 클래스를 자바스크립트 클래스로 옮긴 파일 (화면 코드는 app.js)
//
//  C++ 파일          →  이 파일의 클래스
//  Nutrition.h       →  Nutrition      (operator+ → plus(), operator* → times())
//  Consumable.h      →  Consumable(추상) → FoodItem (상속·다형성)
//  FoodDatabase.h    →  FoodDatabase   (foods.csv → foods.js 배열 + 내가 추가한 음식)
//  UserProfile.h     →  UserProfile    (BMR·TDEE·목표 탄단지 계산, 같은 공식)
//  DailyLog.h        →  DailyLog       (날짜별 기록, 파일 대신 localStorage)
//  StorageUtil.h     →  Storage        (저장 실패 시 예외 → 호출한 쪽이 되돌리기)
//  (웹에서 새로 추가) →  Favorites      (☆ 즐겨찾기)
// ============================================================================

// ----------------------------------------------------------------------------
// Storage: 브라우저 저장소(localStorage) 읽기·쓰기
//  C++은 profile.txt, log_YYYY-MM-DD.csv 파일에 저장했지만, 웹 페이지는
//  컴퓨터 파일을 마음대로 쓸 수 없어서 브라우저 안의 저장소를 쓴다.
//  저장에 실패하면(저장 공간 부족, 비공개 모드 등) 예외를 던진다.
//  → C++ saveAtomic처럼 "저장 성공해야만 화면에 반영"하기 위해서다.
// ----------------------------------------------------------------------------
const PREFIX = 'nutrilogic.';

const Storage = {
  read(key, fallback) {
    try {
      const text = localStorage.getItem(PREFIX + key);
      return text === null ? fallback : JSON.parse(text);
    } catch (e) {
      return fallback;   // 깨진 값이면 없는 것으로 본다
    }
  },
  write(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) {
      throw new Error('브라우저 저장소에 저장하지 못했습니다. (저장 공간 부족 또는 비공개 창)');
    }
  },
  remove(key) {
    try { localStorage.removeItem(PREFIX + key); } catch (e) { /* 지울 게 없으면 그만 */ }
  },
  // nutrilogic.으로 시작하는 키 전부 (JSON 백업용)
  allKeys() {
    try {
      return Object.keys(localStorage).filter(k => k.startsWith(PREFIX)).map(k => k.slice(PREFIX.length));
    } catch (e) {
      return [];
    }
  },
};

// 숫자 검사: C++ csvNumber처럼 "완전한 숫자"이고 범위 안일 때만 통과
function checkNumber(value, min, max, label) {
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (String(value).trim() === '' || !Number.isFinite(n)) throw new RangeError(`${label}에 숫자를 입력해 주세요.`);
  if (n < min || n > max) throw new RangeError(`${label}은(는) ${min} ~ ${max} 사이로 입력해 주세요.`);
  return n;
}

// ----------------------------------------------------------------------------
// 날짜 도우미: "2026-11-14" 형태 (C++ dateText와 같은 형식)
// ----------------------------------------------------------------------------
const DateUtil = {
  key(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },
  parse(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  },
  addDays(key, days) {
    const date = DateUtil.parse(key);
    date.setDate(date.getDate() + days);   // 월말·연말도 Date가 알아서 넘겨 준다
    return DateUtil.key(date);
  },
  today() { return DateUtil.key(new Date()); },
  label(key) {   // 2026.11.14 (토)
    const date = DateUtil.parse(key);
    const week = '일월화수목금토'[date.getDay()];
    return `${key.replace(/-/g, '.')} (${week})`;
  },
  short(key) {   // 11.14
    return key.slice(5).replace('-', '.');
  },
  weekday(key) { return '일월화수목금토'[DateUtil.parse(key).getDay()]; },
};

// ----------------------------------------------------------------------------
// Nutrition: 영양소 4가지 묶음 (C++ Nutrition.h)
//  자바스크립트는 연산자 오버로딩이 없어서 + 대신 plus(), * 대신 times()를 쓴다.
// ----------------------------------------------------------------------------
class Nutrition {
  constructor(kcal = 0, carb = 0, protein = 0, fat = 0) {
    this.kcal = kcal;
    this.carb = carb;
    this.protein = protein;
    this.fat = fat;
  }
  plus(other) {   // C++: operator+
    return new Nutrition(this.kcal + other.kcal, this.carb + other.carb,
                         this.protein + other.protein, this.fat + other.fat);
  }
  times(ratio) {  // C++: operator*
    return new Nutrition(this.kcal * ratio, this.carb * ratio, this.protein * ratio, this.fat * ratio);
  }
  minus(other) { return this.plus(other.times(-1)); }
  static from(obj) {   // 저장해 둔 {kcal, carb, ...} → Nutrition 객체
    return new Nutrition(
      checkNumber(obj.kcal, 0, 100000, '칼로리'), checkNumber(obj.carb, 0, 100000, '탄수화물'),
      checkNumber(obj.protein, 0, 100000, '단백질'), checkNumber(obj.fat, 0, 100000, '지방'));
  }
}

// 끼니 (웹에서 새로 추가)
const MEALS = [
  { id: 'breakfast', name: '아침' },
  { id: 'lunch', name: '점심' },
  { id: 'dinner', name: '저녁' },
  { id: 'snack', name: '간식' },
];
const MEAL_NAME = Object.fromEntries(MEALS.map(m => [m.id, m.name]));

// 지금 시각으로 끼니 추측 (기록 화면 기본값)
function guessMeal(date = new Date()) {
  const h = date.getHours();
  if (h >= 5 && h < 10) return 'breakfast';
  if (h >= 10 && h < 15) return 'lunch';
  if (h >= 17 && h < 21) return 'dinner';
  return 'snack';
}

// ----------------------------------------------------------------------------
// Consumable: "먹을 수 있는 것"의 공통 틀 (C++ 추상 클래스)
//  자바스크립트에는 순수 가상 함수(= 0)가 없으므로,
//  ① Consumable을 직접 new 하면 오류, ② 자식이 함수를 안 만들면 오류가 나게 해서 흉내 낸다.
// ----------------------------------------------------------------------------
class Consumable {
  constructor() {
    if (new.target === Consumable) throw new TypeError('Consumable은 추상 클래스라서 직접 만들 수 없습니다.');
  }
  getName() { throw new Error('자식 클래스가 getName()을 만들어야 합니다.'); }
  getNutrition() { throw new Error('자식 클래스가 getNutrition()을 만들어야 합니다.'); }
  toRecord() { throw new Error('자식 클래스가 toRecord()를 만들어야 합니다.'); }   // C++ writeTo()
}

// ----------------------------------------------------------------------------
// FoodItem: 음식 1개를 몇 g 먹었는지 (C++ FoodItem)
//  핵심 계산은 C++과 똑같다: 실제 영양소 = 100g 기준 영양소 × (먹은 양 ÷ 100)
//  웹에서 늘어난 칸: id(수정·삭제용), key(즐겨찾기 연결), meal(끼니), source(어디서 왔는지)
// ----------------------------------------------------------------------------
let itemCounter = 0;

class FoodItem extends Consumable {
  constructor({ name, per100g, grams, key = '', meal = 'snack', source = 'db', id = null, createdAt = null }) {
    super();
    if (!name || !String(name).trim()) throw new Error('음식 이름이 비어 있습니다.');
    // 0g 이하로 먹는 건 말이 안 되므로 객체를 만들 때부터 막는다 (C++과 같음)
    if (!(grams > 0)) throw new RangeError('섭취량은 0g보다 커야 합니다.');
    this.name = String(name).trim();
    this.per100g = per100g instanceof Nutrition ? per100g : Nutrition.from(per100g);
    this.grams = grams;
    this.key = key || 'my:' + this.name;
    this.meal = MEAL_NAME[meal] ? meal : 'snack';
    this.source = source;
    this.id = id || `${Date.now().toString(36)}-${(itemCounter++).toString(36)}`;
    this.createdAt = createdAt || new Date().toISOString();
  }
  getName() { return `${this.name} ${Math.round(this.grams)}g`; }   // C++과 같은 모양
  getNutrition() { return this.per100g.times(this.grams / 100); }
  toRecord() {   // 저장할 모양 (C++: FOOD,이름,먹은양,kcal,탄,단,지)
    const { id, key, name, grams, meal, source, createdAt } = this;
    return { type: 'FOOD', id, key, name, grams, meal, source, createdAt, per100g: { ...this.per100g } };
  }
  static fromRecord(record) {
    if (!record || record.type !== 'FOOD') throw new Error('기록 형식 오류');
    return new FoodItem({ ...record, grams: checkNumber(record.grams, 0.01, 100000, '섭취량') });
  }
}

// ----------------------------------------------------------------------------
// DailyLog: 하루치 기록 (C++ DailyLog)
//  C++: vector<Consumable*> + 날짜별 파일  →  웹: 배열 + 날짜별 localStorage 키
//  C++의 new/delete·복사 금지는 자바스크립트가 메모리를 자동 정리(가비지 컬렉션)해서 필요 없다.
//  모든 변경 함수는 "바꾸고 → 저장 → 실패하면 원래대로 되돌리고 예외"를 따른다. (C++ removeLast와 같은 생각)
// ----------------------------------------------------------------------------
class DailyLog {
  constructor(date) {
    this.date = date;
    this.items = [];
  }
  static storageKey(date) { return 'log.' + date; }

  // 불러오기: 깨진 기록은 건너뛰고 읽은 개수를 돌려준다 (C++ loadFromFile)
  static load(date) {
    const log = new DailyLog(date);
    const records = Storage.read(DailyLog.storageKey(date), []);
    if (Array.isArray(records)) {
      for (const record of records) {
        try { log.items.push(FoodItem.fromRecord(record)); } catch (e) { /* 깨진 줄은 건너뛴다 */ }
      }
    }
    return log;
  }
  save() {
    if (this.items.length === 0) Storage.remove(DailyLog.storageKey(this.date));
    else Storage.write(DailyLog.storageKey(this.date), this.items.map(item => item.toRecord()));
  }
  // 변경을 시도하고, 저장에 실패하면 이전 상태로 돌려놓는다
  _change(fn) {
    const backup = this.items.slice();
    try { const result = fn(); this.save(); return result; }
    catch (e) { this.items = backup; throw e; }
  }

  add(item) { return this._change(() => { this.items.push(item); return item; }); }
  remove(id) {
    return this._change(() => {
      const index = this.items.findIndex(item => item.id === id);
      if (index < 0) throw new Error('이미 지워진 기록입니다.');
      return { item: this.items.splice(index, 1)[0], index };
    });
  }
  insertAt(item, index) { return this._change(() => { this.items.splice(index, 0, item); }); }
  update(id, { grams, meal }) {
    return this._change(() => {
      const index = this.items.findIndex(item => item.id === id);
      if (index < 0) throw new Error('수정할 기록을 찾지 못했습니다.');
      const old = this.items[index];
      this.items[index] = new FoodItem({ ...old.toRecord(), per100g: old.per100g, grams, meal });
    });
  }
  find(id) { return this.items.find(item => item.id === id); }
  isEmpty() { return this.items.length === 0; }
  count() { return this.items.length; }

  // 합계: 부모(Consumable)의 getNutrition()을 불러도 실제 객체 것이 실행된다 (다형성)
  getTotal() {
    return this.items.reduce((total, item) => total.plus(item.getNutrition()), new Nutrition());
  }
  // 끼니별 묶음 (웹 추가)
  byMeal() {
    return MEALS.map(meal => ({ ...meal, items: this.items.filter(item => item.meal === meal.id) }))
                .filter(group => group.items.length > 0);
  }
}

// ----------------------------------------------------------------------------
// UserProfile: 신체 정보 → 하루 영양 목표 (C++ UserProfile, 공식·상수 동일)
//  1) BMR  : Mifflin-St Jeor 공식
//  2) TDEE : BMR × 활동계수
//  3) 목표 칼로리 : TDEE × 목표 비율 (다이어트 0.85 / 유지 1.0 / 벌크업 1.1)
//  4) 단백질 = 체중×1.8, 지방 = 칼로리×25%÷9, 나머지 = 탄수화물
// ----------------------------------------------------------------------------
const ACTIVITY_FACTOR = [1.2, 1.375, 1.55, 1.725];
const GOAL_FACTOR = [0.85, 1.0, 1.1];
const ACTIVITY_NAME = ['거의 안 함', '주 1~3회', '주 3~5회', '주 6~7회'];
const GOAL_NAME = ['다이어트', '유지', '벌크업'];
const PROTEIN_PER_KG = 1.8;
const FAT_RATIO = 0.25;

class UserProfile {
  constructor({ isMale = true, age = 0, height = 0, weight = 0, activity = 0, goal = 1 } = {}) {
    this.isMale = !!isMale;
    this.age = age;
    this.height = height;
    this.weight = weight;
    this.activity = activity;
    this.goal = goal;
  }
  // 입력 범위 검사 (C++ readNumber 범위와 같음, 나이는 성인 공식이라 19~100)
  validate() {
    checkNumber(this.age, 19, 100, '나이');
    if (!Number.isInteger(Number(this.age))) throw new RangeError('나이는 정수로 입력해 주세요.');
    checkNumber(this.height, 100, 250, '키');
    checkNumber(this.weight, 30, 300, '체중');
    if (!(this.activity in ACTIVITY_FACTOR)) throw new RangeError('운동 횟수를 골라 주세요.');
    if (!(this.goal in GOAL_FACTOR)) throw new RangeError('운동 목표를 골라 주세요.');
    this.calcTarget();   // 목표 계산까지 되는지 확인
    return this;
  }
  calcBMR() {
    const bmr = 10 * this.weight + 6.25 * this.height - 5 * this.age;
    return this.isMale ? bmr + 5 : bmr - 161;
  }
  calcTDEE() { return this.calcBMR() * ACTIVITY_FACTOR[this.activity]; }
  calcTarget() {
    const kcal = this.calcTDEE() * GOAL_FACTOR[this.goal];
    const protein = this.weight * PROTEIN_PER_KG;
    const fat = kcal * FAT_RATIO / 9;                  // 지방 1g = 9kcal
    const carb = (kcal - protein * 4 - fat * 9) / 4;   // 남은 열량을 탄수화물로 (1g = 4kcal)
    if (carb <= 0) throw new RangeError('탄수화물 목표가 0 이하로 계산됩니다. 입력값을 다시 확인하세요.');
    return new Nutrition(kcal, carb, protein, fat);
  }
  save() { Storage.write('profile', { ...this }); }
  static load() {   // 없거나 값이 이상하면 null (C++: false 반환 → 새로 입력)
    const saved = Storage.read('profile', null);
    if (!saved) return null;
    try { return new UserProfile(saved).validate(); } catch (e) { return null; }
  }
  static remove() { Storage.remove('profile'); }
}

// ----------------------------------------------------------------------------
// FoodDatabase: 음식 목록 + 검색 (C++ FoodDatabase)
//  기본 88개(foods.js) + 웹에서 사용자가 추가한 음식(localStorage 'customFoods')
// ----------------------------------------------------------------------------
class FoodDatabase {
  constructor(rows) {
    this.builtIn = [];
    let skipped = 0;
    for (const row of rows) {   // C++처럼 형식이 깨진 줄은 건너뛴다
      try {
        const [id, name, servingG, kcal, carb, protein, fat] = row;
        if (!(id > 0) || !(servingG > 0) || !name) throw new Error('Invalid food');
        this.builtIn.push({ id, name, servingG, per100g: new Nutrition(kcal, carb, protein, fat), key: 'db:' + id, custom: false });
      } catch (e) { skipped++; }
    }
    if (this.builtIn.length === 0) throw new Error('읽을 수 있는 음식이 없습니다.');
    this.custom = [];
    for (const saved of Storage.read('customFoods', [])) {
      try { this.custom.push(FoodDatabase.makeCustom(saved)); } catch (e) { skipped++; }
    }
    this.skipped = skipped;
  }
  static makeCustom({ id, name, servingG, per100g }) {
    name = String(name || '').trim();
    if (!name) throw new Error('음식 이름을 입력해 주세요.');
    return { id, name, servingG: checkNumber(servingG, 1, 3000, '1회 제공량'), per100g: Nutrition.from(per100g), key: 'custom:' + id, custom: true };
  }
  all() { return [...this.custom, ...this.builtIn]; }

  // 이름에 keyword가 들어간 음식 (빈 칸이면 전체). 띄어쓰기는 무시한다.
  search(keyword = '') {
    const k = keyword.replace(/\s/g, '');
    if (!k) return this.all();
    return this.all().filter(food => food.name.replace(/\s/g, '').includes(k));
  }
  findByKey(key) { return this.all().find(food => food.key === key) || null; }
  findById(id) {   // C++과 같이 없으면 예외
    const food = this.all().find(f => f.id === id);
    if (!food) throw new RangeError(`${id}번 음식은 없습니다.`);
    return food;
  }

  // 음식 데이터 추가 (웹에서 새로 추가한 기능)
  addCustom({ name, servingG, per100g }) {
    const id = Math.max(1000, ...this.custom.map(f => f.id)) + 1;
    const food = FoodDatabase.makeCustom({ id, name, servingG, per100g });
    if (this.all().some(f => f.name === food.name)) throw new Error(`'${food.name}'은(는) 이미 목록에 있습니다.`);
    this.custom.unshift(food);
    try { this._save(); } catch (e) { this.custom.shift(); throw e; }
    return food;
  }
  removeCustom(id) {
    const backup = this.custom.slice();
    this.custom = this.custom.filter(f => f.id !== id);
    try { this._save(); } catch (e) { this.custom = backup; throw e; }
  }
  _save() {
    Storage.write('customFoods', this.custom.map(({ id, name, servingG, per100g }) => ({ id, name, servingG, per100g: { ...per100g } })));
  }
}

// ----------------------------------------------------------------------------
// Favorites: ☆ 즐겨찾기 (웹에서 새로 추가)
//  목록 음식뿐 아니라 직접 입력한 음식(서브웨이 등)도 이름·영양값째 저장해서 다시 쓸 수 있다.
// ----------------------------------------------------------------------------
class Favorites {
  constructor() {
    this.list = [];
    for (const saved of Storage.read('favorites', [])) {
      try {
        this.list.push({ key: saved.key, name: String(saved.name), servingG: checkNumber(saved.servingG, 0.01, 100000, '양'), per100g: Nutrition.from(saved.per100g) });
      } catch (e) { /* 깨진 항목은 건너뛴다 */ }
    }
  }
  has(key) { return this.list.some(f => f.key === key); }
  get(key) { return this.list.find(f => f.key === key) || null; }
  add({ key, name, servingG, per100g }) {
    if (this.has(key)) return;
    this.list.unshift({ key, name, servingG, per100g });
    try { this._save(); } catch (e) { this.list.shift(); throw e; }
  }
  remove(key) {
    const backup = this.list.slice();
    this.list = this.list.filter(f => f.key !== key);
    try { this._save(); } catch (e) { this.list = backup; throw e; }
  }
  toggle(food) {   // 켜졌으면 true
    if (this.has(food.key)) { this.remove(food.key); return false; }
    this.add(food); return true;
  }
  _save() {
    Storage.write('favorites', this.list.map(f => ({ key: f.key, name: f.name, servingG: f.servingG, per100g: { ...f.per100g } })));
  }
}

// ----------------------------------------------------------------------------
// 다음 식사 추천 (웹에서 새로 추가)
//  남은 영양소(목표 - 먹은 양)를 기준으로, 1회 제공량을 먹었을 때
//   · 가장 부족한 영양소를 많이 채우고
//   · 남은 칼로리(이번 끼니 몫)에 가깝고
//   · 이미 넘친 영양소는 더 넣지 않는 음식에 높은 점수를 준다.
// ----------------------------------------------------------------------------
function recommendNext(db, target, eaten, eatenKeys, now = new Date()) {
  const remain = target.minus(eaten);
  const meal = guessMeal(now);
  const mealsLeft = { breakfast: 3, lunch: 2, dinner: 1, snack: 1 }[meal];
  const names = { carb: '탄수화물', protein: '단백질', fat: '지방' };

  // 가장 부족한 영양소 (목표 대비 남은 비율이 가장 큰 것)
  //  지방은 대부분의 식사에서 저절로 채워지고, 지방을 채우려고 기름진 음식을 추천하면
  //  식단 코치로서 좋지 않으므로 '집중할 영양소'는 탄수화물·단백질 중에서 고른다.
  const gaps = ['carb', 'protein'].map(k => ({ k, ratio: remain[k] / target[k] }));
  gaps.sort((a, b) => b.ratio - a.ratio);
  const focus = gaps[0];

  if (remain.kcal < 120) {
    const light = db.builtIn.filter(f => f.per100g.kcal * f.servingG / 100 <= 60)
      .map(food => ({ food, n: food.per100g.times(food.servingG / 100) }))
      .sort((a, b) => b.n.protein - a.n.protein).slice(0, 3);
    return { meal, remain, focus: null, budget: Math.max(remain.kcal, 0), picks: light,
             message: remain.kcal < 0 ? `오늘 목표보다 ${Math.round(-remain.kcal)}kcal 더 드셨어요. 더 드신다면 가벼운 음식으로 골라 보세요.`
                                       : '오늘 목표 칼로리를 거의 채웠어요. 출출하면 가벼운 음식만 추천해요.' };
  }

  // 이번 끼니 몫: 남은 칼로리를 남은 끼니 수로 나누되, 한 끼가 하루 목표의 35%를 넘지 않게
  const budget = meal === 'snack' ? Math.min(remain.kcal, 300)
                                  : Math.min(Math.max(remain.kcal / mealsLeft, 250), target.kcal * 0.35);
  // 추천은 음식 한 가지이므로, 한 끼 몫의 약 65%(나머지는 반찬·국 몫)를 기준으로 고른다
  const itemKcal = meal === 'snack' ? budget : budget * 0.65;
  // 영양소별 가중치: 단백질을 가장 중요하게, 지방은 대부분 식사에서 자연히 채워지므로 낮게
  const weightOf = { protein: 2, carb: 1, fat: 0.5 };
  const scored = db.builtIn.map(food => {
    const n = food.per100g.times(food.servingG / 100);
    let score = 0;
    for (const k of ['carb', 'protein', 'fat']) {
      const need = Math.max(remain[k], 0);
      const weight = weightOf[k] * (k === focus.k ? 1.5 : 1);
      score += weight * Math.min(n[k], need) / target[k];      // 부족한 걸 채운 만큼 +
      score -= 1.5 * Math.max(n[k] - need, 0) / target[k];     // 남은 양보다 넘친 만큼 -
    }
    score -= 1.2 * Math.abs(n.kcal - itemKcal) / itemKcal;     // 기준 열량과 차이만큼 -
    if (eatenKeys.has(food.key)) score -= 0.3;                  // 오늘 이미 먹은 건 조금 -
    if (n.kcal > 0 && n.fat * 9 / n.kcal > 0.45) score -= 0.5;  // 열량의 45% 넘게 지방인 음식은 -
    // 1회 분량이 기준 열량의 1.4배를 넘거나 하루 남은 칼로리를 넘으면 추천하지 않는다
    const tooBig = n.kcal > itemKcal * 1.4 || n.kcal > remain.kcal + 50;
    return { food, n, score: tooBig ? score - 100 : score };
  });
  scored.sort((a, b) => b.score - a.score);
  return {
    meal, remain, focus, budget, picks: scored.slice(0, 3),
    message: `${names[focus.k]}이 가장 부족해요 (남은 ${Math.round(Math.max(remain[focus.k], 0))}g). 이번 ${MEAL_NAME[meal]}은 약 ${Math.round(budget)}kcal 정도가 알맞아요.`,
  };
}
