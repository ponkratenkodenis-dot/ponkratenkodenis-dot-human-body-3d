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
  "Body": "Кожа", "Clothes_Sportsuit": "Одежда", "Clothes_Shoes": "Обувь", "Hair": "Волосы"
};
export function ruName(n) {
  if (!n) return "";
  n = n.replace(/^M /, "");
  if (V[n]) return V[n]; if (RIB[n]) return RIB[n]; if (SINGLE[n]) return SINGLE[n];
  let m = n.match(/^Intervertebral disc (\w+)-(\w+)$/); if (m) return `Межпозвонковый диск ${m[1]}–${m[2]}`;
  m = n.match(/^Nucleus pulposus (\w+)-(\w+)$/); if (m) return `Пульпозное ядро диска ${m[1]}–${m[2]}`;
  m = n.match(/^(.*)\.([lr])$/);
  if (m && PAIR[m[1]]) return `${PAIR[m[1]][0]}, ${(PAIR[m[1]][1] === "m" ? SIDEM : SIDE)[m[2]]}`;
  if (m) return `${m[1]} (${m[2] === "l" ? "лев." : "прав."})`;
  return n;
}
export const VERTEBRAE = ["Atlas (C1)", "Axis (C2)", ...[3, 4, 5, 6, 7].map(i => `Vertebra C${i}`), ...Array.from({ length: 12 }, (_, i) => `Vertebra T${i + 1}`),
  ...[1, 2, 3, 4, 5].map(i => `Vertebra L${i}`), "Sacrum", "Coccyx"];
