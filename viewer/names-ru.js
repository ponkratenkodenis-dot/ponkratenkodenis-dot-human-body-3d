// Russian names for the parts people ask about most; everything else falls back to the English (TA) name from Z-Anatomy.
const V = {};
for (let i = 3; i <= 7; i++) V[`Vertebra C${i}`] = `Шейный позвонок C${i}`;
for (let i = 1; i <= 12; i++) V[`Vertebra T${i}`] = `Грудной позвонок T${i}`;
for (let i = 1; i <= 5; i++) V[`Vertebra L${i}`] = `Поясничный позвонок L${i}`;
const ORD = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"];
const RIB = {};
ORD.forEach((w, i) => {
  const W = w[0].toUpperCase() + w.slice(1);
  RIB[`${W} rib.l`] = `${i + 1}-е ребро, левое`; RIB[`${W} rib.r`] = `${i + 1}-е ребро, правое`;
  RIB[`Costal cartilage of ${w} rib.l`] = `Рёберный хрящ ${i + 1}-го ребра, левый`; RIB[`Costal cartilage of ${w} rib.r`] = `Рёберный хрящ ${i + 1}-го ребра, правый`;
});
const SIDE = { l: "левая", r: "правая" }, SIDEM = { l: "левый", r: "правый" };
const PAIR = {
  "Femur": ["Бедренная кость", "f"], "Tibia": ["Большеберцовая кость", "f"], "Fibula": ["Малоберцовая кость", "f"], "Patella": ["Надколенник", "m"],
  "Humerus": ["Плечевая кость", "f"], "Radius": ["Лучевая кость", "f"], "Ulna": ["Локтевая кость", "f"], "Clavicle": ["Ключица", "f"],
  "Scapula": ["Лопатка", "f"], "Hip bone": ["Тазовая кость", "f"], "Calcaneus": ["Пяточная кость", "f"], "Talus": ["Таранная кость", "f"],
  "Parietal bone": ["Теменная кость", "f"], "Temporal bone": ["Височная кость", "f"],
  "Gluteus maximus muscle": ["Большая ягодичная мышца", "f"], "Biceps brachii muscle": ["Двуглавая мышца плеча", "f"],
  "Triceps brachii muscle": ["Трёхглавая мышца плеча", "f"], "Deltoid muscle": ["Дельтовидная мышца", "f"],
  "Pectoralis major muscle": ["Большая грудная мышца", "f"], "Latissimus dorsi muscle": ["Широчайшая мышца спины", "f"],
  "Trapezius muscle": ["Трапециевидная мышца", "f"], "Rectus abdominis muscle": ["Прямая мышца живота", "f"],
  "External oblique muscle": ["Наружная косая мышца живота", "f"], "Sternocleidomastoid muscle": ["Грудино-ключично-сосцевидная мышца", "f"],
  "Rectus femoris muscle": ["Прямая мышца бедра", "f"], "Vastus lateralis muscle": ["Латеральная широкая мышца бедра", "f"],
  "Vastus medialis muscle": ["Медиальная широкая мышца бедра", "f"], "Sartorius muscle": ["Портняжная мышца", "f"],
  "Gastrocnemius muscle": ["Икроножная мышца", "f"], "Soleus muscle": ["Камбаловидная мышца", "f"], "Tibialis anterior muscle": ["Передняя большеберцовая мышца", "f"],
  "Iliopsoas muscle": ["Подвздошно-поясничная мышца", "f"], "Psoas major muscle": ["Большая поясничная мышца", "f"],
  "Erector spinae muscle": ["Мышца, выпрямляющая позвоночник", "f"], "Quadratus lumborum muscle": ["Квадратная мышца поясницы", "f"],
  "Serratus anterior muscle": ["Передняя зубчатая мышца", "f"], "Rhomboid major muscle": ["Большая ромбовидная мышца", "f"]
};
const SINGLE = {
  "Atlas (C1)": "Атлант (C1)", "Axis (C2)": "Осевой позвонок (C2)", "Sacrum": "Крестец", "Coccyx": "Копчик",
  "Body of sternum": "Тело грудины", "Manubrium of sternum": "Рукоятка грудины", "Mandible": "Нижняя челюсть", "Hyoid bone": "Подъязычная кость",
  "Frontal bone": "Лобная кость", "Occipital bone": "Затылочная кость", "Sphenoid bone": "Клиновидная кость",
  "Anterior longitudinal ligament": "Передняя продольная связка", "Posterior longitudinal ligament": "Задняя продольная связка",
  "Ligamenta flava": "Жёлтые связки", "Interspinous ligaments": "Межостистые связки", "Nuchal ligament": "Выйная связка",
  "Superior lobe of right lung": "Верхняя доля правого лёгкого", "Middle lobe of right lung": "Средняя доля правого лёгкого", "Inferior lobe of right lung": "Нижняя доля правого лёгкого",
  "Superior lobe of left lung": "Верхняя доля левого лёгкого", "Inferior lobe of left lung": "Нижняя доля левого лёгкого", "Trachea": "Трахея",
  "Right atrium": "Правое предсердие", "Left atrium": "Левое предсердие", "Right ventricle": "Правый желудочек", "Left ventricle": "Левый желудочек", "Pulmonary trunk": "Лёгочный ствол",
  "Oesophagus": "Пищевод", "Stomach": "Желудок", "Duodenum": "Двенадцатиперстная кишка", "Jejunum": "Тонкая кишка (тощая)", "Ascending colon": "Восходящая ободочная кишка",
  "Transverse colon": "Поперечная ободочная кишка", "Descending colon": "Нисходящая ободочная кишка", "Vermiform appendix": "Червеобразный отросток (аппендикс)",
  "Liver": "Печень", "Gallbladder": "Желчный пузырь", "Pancreas": "Поджелудочная железа", "Spleen": "Селезёнка", "Urinary bladder": "Мочевой пузырь",
  "Suprarenal gland.l": "Надпочечник, левый", "Suprarenal gland.r": "Надпочечник, правый",
  "Body": "Кожа", "Clothes_Sportsuit": "Одежда", "Clothes_Shoes": "Обувь", "Hair": "Волосы"
};
// muscles: base names and the "<part> of <muscle>" pattern
const MUS = {
  "biceps brachii": "двуглавая мышца плеча", "triceps brachii": "трёхглавая мышца плеча", "biceps femoris": "двуглавая мышца бедра",
  "deltoid muscle": "дельтовидная мышца", "pectoralis major muscle": "большая грудная мышца", "trapezius muscle": "трапециевидная мышца",
  "gastrocnemius": "икроножная мышца", "flexor pollicis brevis": "короткий сгибатель большого пальца", "adductor pollicis": "мышца, приводящая большой палец",
  "masseter": "жевательная мышца", "lateral pterygoid muscle": "латеральная крыловидная мышца", "pronator teres": "круглый пронатор",
  "extensor carpi ulnaris": "локтевой разгибатель запястья", "flexor carpi ulnaris": "локтевой сгибатель запястья", "flexor digitorum superficialis": "поверхностный сгибатель пальцев",
  "flexor hallucis brevis": "короткий сгибатель большого пальца стопы", "digastric muscle": "двубрюшная мышца"
};
const PART = { "long head": "длинная головка", "short head": "короткая головка", "lateral head": "латеральная головка", "medial head": "медиальная головка",
  "clavicular part": "ключичная часть", "acromial part": "акромиальная часть", "scapular spinal part": "остистая часть", "descending part": "нисходящая часть",
  "transverse part": "поперечная часть", "ascending part": "восходящая часть", "clavicular head": "ключичная головка", "sternocostal head": "грудино-рёберная головка",
  "abdominal part": "брюшная часть", "superficial head": "поверхностная головка", "deep head": "глубокая головка", "humeral head": "плечевая головка", "ulnar head": "локтевая головка",
  "superficial part": "поверхностная часть", "deep part": "глубокая часть", "oblique head": "косая головка", "transverse head": "поперечная головка",
  "anterior belly": "переднее брюшко", "posterior belly": "заднее брюшко", "humero-ulnar head": "плечелоктевая головка", "inferior head": "нижняя головка", "superior head": "верхняя головка" };
const MBASE = {
  "Gluteus maximus muscle": "Большая ягодичная мышца", "Gluteus medius muscle": "Средняя ягодичная мышца", "Gluteus minimus muscle": "Малая ягодичная мышца",
  "Rectus femoris muscle": "Прямая мышца бедра", "Vastus lateralis muscle": "Латеральная широкая мышца бедра", "Vastus medialis muscle": "Медиальная широкая мышца бедра",
  "Vastus intermedius muscle": "Промежуточная широкая мышца бедра", "Sartorius muscle": "Портняжная мышца", "Gracilis muscle": "Тонкая мышца",
  "Semitendinosus muscle": "Полусухожильная мышца", "Semimembranosus muscle": "Полуперепончатая мышца", "Adductor longus": "Длинная приводящая мышца",
  "Adductor brevis": "Короткая приводящая мышца", "Adductor magnus": "Большая приводящая мышца", "Pectineus muscle": "Гребенчатая мышца",
  "Tensor fasciae latae": "Напрягатель широкой фасции", "Iliacus muscle": "Подвздошная мышца", "Psoas major": "Большая поясничная мышца",
  "Piriformis muscle": "Грушевидная мышца", "Quadratus femoris muscle": "Квадратная мышца бедра", "Obturator externus": "Наружная запирательная мышца",
  "Superior gemellus muscle": "Верхняя близнецовая мышца", "Inferior gemellus muscle": "Нижняя близнецовая мышца",
  "Tibialis anterior muscle": "Передняя большеберцовая мышца", "Tibialis posterior muscle": "Задняя большеберцовая мышца", "Soleus muscle": "Камбаловидная мышца",
  "Fibularis longus muscle": "Длинная малоберцовая мышца", "Fibularis brevis muscle": "Короткая малоберцовая мышца", "Fibularis tertius muscle": "Третья малоберцовая мышца",
  "Extensor digitorum longus": "Длинный разгибатель пальцев", "Extensor hallucis longus": "Длинный разгибатель большого пальца стопы", "Flexor digitorum longus": "Длинный сгибатель пальцев",
  "Flexor hallucis longus": "Длинный сгибатель большого пальца стопы", "Popliteus muscle": "Подколенная мышца", "Plantaris muscle": "Подошвенная мышца",
  "Brachialis muscle": "Плечевая мышца", "Brachioradialis muscle": "Плечелучевая мышца", "Anconeus muscle": "Локтевая мышца", "Supinator": "Мышца-супинатор",
  "Coracobrachialis muscle": "Клювовидно-плечевая мышца", "Extensor carpi radialis longus": "Длинный лучевой разгибатель запястья", "Extensor carpi radialis brevis": "Короткий лучевой разгибатель запястья",
  "Flexor carpi radialis": "Лучевой сгибатель запястья", "Palmaris longus muscle": "Длинная ладонная мышца", "Extensor digitorum": "Разгибатель пальцев",
  "Flexor digitorum profundus": "Глубокий сгибатель пальцев", "Flexor pollicis longus": "Длинный сгибатель большого пальца",
  "Supraspinatus muscle": "Надостная мышца", "Infraspinatus muscle": "Подостная мышца", "Teres major muscle": "Большая круглая мышца", "Teres minor muscle": "Малая круглая мышца",
  "Subscapularis muscle": "Подлопаточная мышца", "Latissimus dorsi muscle": "Широчайшая мышца спины", "Rhomboid major muscle": "Большая ромбовидная мышца",
  "Rhomboid minor muscle": "Малая ромбовидная мышца", "Levator scapulae": "Мышца, поднимающая лопатку", "Serratus anterior muscle": "Передняя зубчатая мышца",
  "Pectoralis minor muscle": "Малая грудная мышца", "Subclavius muscle": "Подключичная мышца",
  "Rectus abdominis muscle": "Прямая мышца живота", "External abdominal oblique muscle": "Наружная косая мышца живота", "Internal abdominal oblique muscle": "Внутренняя косая мышца живота",
  "Transversus abdominis muscle": "Поперечная мышца живота", "Quadratus lumborum muscle": "Квадратная мышца поясницы",
  "Iliocostalis lumborum muscle": "Подвздошно-рёберная мышца поясницы", "Iliocostalis thoracis muscle": "Подвздошно-рёберная мышца груди", "Longissimus thoracis muscle": "Длиннейшая мышца груди",
  "Spinalis thoracis muscle": "Остистая мышца груди", "Multifidus lumborum muscle": "Многораздельная мышца (поясница)", "Multifidus thoracis muscle": "Многораздельная мышца (грудь)",
  "Sternocleidomastoid muscle": "Грудино-ключично-сосцевидная мышца", "Splenius capitis muscle": "Ремённая мышца головы", "Scalenus anterior muscle": "Передняя лестничная мышца",
  "Scalenus medius muscle": "Средняя лестничная мышца", "Scalenus posterior muscle": "Задняя лестничная мышца", "Temporalis muscle": "Височная мышца", "Platysma": "Подкожная мышца шеи",
  "External intercostal muscles": "Наружные межрёберные мышцы", "Internal intercostal muscles": "Внутренние межрёберные мышцы"
};
function ruMuscle(n) {
  if (MBASE[n]) return MBASE[n];
  const m = n.match(/^(.+?) of (.+?)( muscle)?$/i);
  if (m) { const p = PART[m[1].toLowerCase()], b = MUS[m[2].toLowerCase()] || MUS[(m[2] + " muscle").toLowerCase()]; if (p && b) return b[0].toUpperCase() + b.slice(1) + ", " + p; }
  return null;
}
export function ruName(n) {
  if (!n) return "";
  n = n.replace(/^[MO] /, "");
  if (V[n]) return V[n]; if (RIB[n]) return RIB[n]; if (SINGLE[n]) return SINGLE[n];
  let m = n.match(/^Intervertebral disc (\w+)-(\w+)$/); if (m) return `Межпозвонковый диск ${m[1]}–${m[2]}`;
  m = n.match(/^Nucleus pulposus (\w+)-(\w+)$/); if (m) return `Пульпозное ядро диска ${m[1]}–${m[2]}`;
  m = n.match(/^(.*)\.([lr])$/);
  if (m && PAIR[m[1]]) return `${PAIR[m[1]][0]}, ${(PAIR[m[1]][1] === "m" ? SIDEM : SIDE)[m[2]]}`;
  if (m) { const r = ruMuscle(m[1]); if (r) return `${r} (${m[2] === "l" ? "лев." : "прав."})`; }
  if (m) return `${m[1]} (${m[2] === "l" ? "лев." : "прав."})`;
  return n;
}
export const VERTEBRAE = ["Atlas (C1)", "Axis (C2)", ...[3, 4, 5, 6, 7].map(i => `Vertebra C${i}`), ...Array.from({ length: 12 }, (_, i) => `Vertebra T${i + 1}`),
  ...[1, 2, 3, 4, 5].map(i => `Vertebra L${i}`), "Sacrum", "Coccyx"];
