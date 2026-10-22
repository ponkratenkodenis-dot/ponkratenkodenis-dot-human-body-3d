// What each exercise works and how to do it well: shown under the model while it plays, and returned to an AI by
// {"op":"exercise_info"}. Muscles are the model's own part names (without .l/.r), so they can be highlighted.
// General guidance for education, not a medical prescription.
export const NOTE = "Это учебная демонстрация, а не назначение. При боли остановитесь; при болях в спине, травмах или беременности упражнения подбирает врач или реабилитолог.";

export const INFO = {
  squats: {
    goal: "Сила ног и ягодиц, контроль коленей и таза.",
    muscles: [["Rectus femoris muscle", "прямая мышца бедра"], ["Vastus lateralis muscle", "латеральная широкая мышца бедра"], ["Vastus medialis muscle", "медиальная широкая мышца бедра"],
      ["Gluteus maximus muscle", "большая ягодичная"], ["Adductor magnus", "большая приводящая"], ["Iliocostalis lumborum muscle", "мышца, выпрямляющая позвоночник (держит спину)"]],
    cues: ["Таз уходит назад, как будто садитесь на стул", "Колени смотрят туда же, куда носки", "Пятки на полу, спина ровная"],
    caution: "Глубину выбирайте по самочувствию; при боли в колене уменьшите амплитуду."
  },
  forward_bend: {
    goal: "Растяжка задней поверхности бёдер и мышц спины.",
    muscles: [["Long head of biceps femoris", "двуглавая мышца бедра"], ["Semitendinosus muscle", "полусухожильная"], ["Semimembranosus muscle", "полуперепончатая"],
      ["Gluteus maximus muscle", "большая ягодичная"], ["Iliocostalis lumborum muscle", "мышца, выпрямляющая позвоночник"]],
    cues: ["Наклон начинается в тазобедренных суставах", "Колени можно слегка согнуть", "Без рывков и пружинящих движений"],
    caution: "При острой боли в пояснице или онемении в ноге наклоны не делайте."
  },
  side_bends: {
    goal: "Подвижность позвоночника вбок, растяжка боковых мышц корпуса.",
    muscles: [["External abdominal oblique muscle", "наружная косая мышца живота"], ["Internal abdominal oblique muscle", "внутренняя косая"], ["Quadratus lumborum muscle", "квадратная мышца поясницы"]],
    cues: ["Наклон строго в сторону, не вперёд", "Таз остаётся на месте", "Дыхание спокойное"],
    caution: "Двигайтесь медленно, в пределах комфортной амплитуды."
  },
  trunk_rotation: {
    goal: "Подвижность грудного отдела, работа косых мышц.",
    muscles: [["External abdominal oblique muscle", "наружная косая мышца живота"], ["Internal abdominal oblique muscle", "внутренняя косая"], ["Multifidus thoracis muscle", "многораздельные мышцы"]],
    cues: ["Поворачивается грудная клетка, таз смотрит вперёд", "Голова продолжает движение корпуса", "Без рывков в конце"],
    caution: "Поясничный отдел вращается мало; не докручивайте через силу."
  },
  neck_mobility: {
    goal: "Подвижность шеи во всех направлениях.",
    muscles: [["Sternocleidomastoid muscle", "грудино-ключично-сосцевидная"], ["Descending part of trapezius muscle", "верхняя часть трапециевидной"], ["Splenius capitis muscle", "ременная мышца головы"], ["Levator scapulae", "мышца, поднимающая лопатку"]],
    cues: ["Медленно, в каждом направлении отдельно", "Плечи опущены", "Не запрокидывайте голову резко назад"],
    caution: "При головокружении, онемении рук или боли в шее остановитесь."
  },
  cat_cow: {
    goal: "Мягкая подвижность позвоночника сгибание — разгибание, стоя.",
    muscles: [["Rectus abdominis muscle", "прямая мышца живота"], ["Iliocostalis lumborum muscle", "мышца, выпрямляющая позвоночник"], ["Multifidus lumborum muscle", "многораздельные мышцы поясницы"]],
    cues: ["Округляйте спину на выдохе, прогибайте на вдохе", "Движение идёт волной, позвонок за позвонком", "Колени слегка согнуты"],
    caution: "Амплитуда небольшая и без боли."
  },
  calf_raises: {
    goal: "Сила икроножных и камбаловидных мышц, устойчивость стопы.",
    muscles: [["Medial head of gastrocnemius", "икроножная, медиальная головка"], ["Lateral head of gastrocnemius", "икроножная, латеральная головка"], ["Soleus muscle", "камбаловидная"]],
    cues: ["Вес над большим пальцем", "Подъём быстрее, опускание медленнее", "Можно держаться за опору"],
    caution: "При боли в ахилловом сухожилии уменьшите высоту подъёма."
  },
  arm_raises: {
    goal: "Подвижность плечевого сустава и работа мышц плечевого пояса.",
    muscles: [["Acromial part of deltoid muscle", "дельтовидная, средняя часть"], ["Supraspinatus muscle", "надостная"], ["Transverse part of trapezius muscle", "трапециевидная"], ["Serratus anterior muscle", "передняя зубчатая"]],
    cues: ["Плечи не поднимаются к ушам", "Поясница не прогибается", "Руки вверх на вдохе"],
    caution: "При боли в плече поднимайте только до комфортной высоты."
  },
  march: {
    goal: "Сгибатели бедра и контроль корпуса на одной ноге.",
    muscles: [["Psoas major", "большая поясничная"], ["Iliacus muscle", "подвздошная"], ["Rectus femoris muscle", "прямая мышца бедра"], ["Gluteus medius muscle", "средняя ягодичная (держит таз)"]],
    cues: ["Корпус прямой, не отклоняйтесь назад", "Колено до уровня таза", "Руки работают навстречу ногам"],
    caution: "Если трудно держать равновесие, держитесь за опору."
  },
  hand_exercise: {
    goal: "Подвижность пальцев, сгибатели и разгибатели кисти.",
    muscles: [["Flexor digitorum profundus", "глубокий сгибатель пальцев"], ["Radial head of flexor digitorum superficialis", "поверхностный сгибатель пальцев"], ["Extensor digitorum", "разгибатель пальцев"], ["Dorsal interossei muscles of hand", "межкостные мышцы"]],
    cues: ["Кулак без сильного сжатия", "Пальцы разводятся широко", "Темп спокойный"],
    caution: "При онемении пальцев или боли в запястье остановитесь."
  },
  knees_to_chest: {
    goal: "Мягкая растяжка поясницы и ягодиц лёжа.",
    muscles: [["Gluteus maximus muscle", "большая ягодичная (растягивается)"], ["Iliocostalis lumborum muscle", "мышца, выпрямляющая позвоночник (растягивается)"], ["Multifidus lumborum muscle", "многораздельные мышцы поясницы"]],
    cues: ["Подтягивайте колени руками мягко, без рывка", "Голова и плечи лежат на полу", "Дышите животом"],
    caution: "Если тянущее ощущение переходит в боль, уменьшите подтягивание."
  },
  bridge: {
    goal: "Ягодицы и задняя поверхность бедра, поддержка поясницы.",
    muscles: [["Gluteus maximus muscle", "большая ягодичная"], ["Long head of biceps femoris", "двуглавая мышца бедра"], ["Semitendinosus muscle", "полусухожильная"], ["Iliocostalis lumborum muscle", "мышца, выпрямляющая позвоночник"]],
    cues: ["Давите в пол пятками", "Поднимайте таз до прямой линии колени — плечи, не выше", "Рёбра опущены, поясница не прогибается"],
    caution: "Если чувствуете поясницу больше, чем ягодицы, поднимайте таз ниже."
  },
  cat_cow_floor: {
    goal: "Подвижность позвоночника на четвереньках, без нагрузки весом тела.",
    muscles: [["Rectus abdominis muscle", "прямая мышца живота"], ["Iliocostalis lumborum muscle", "мышца, выпрямляющая позвоночник"], ["Multifidus lumborum muscle", "многораздельные мышцы поясницы"]],
    cues: ["Ладони под плечами, колени под тазом", "Выдох — спина круглая, вдох — мягкий прогиб", "Голова продолжает движение позвоночника"],
    caution: "Прогиб умеренный; при боли уменьшите амплитуду."
  },
  bird_dog: {
    goal: "Устойчивость поясницы: спина остаётся неподвижной, пока двигаются рука и нога.",
    muscles: [["Multifidus lumborum muscle", "многораздельные мышцы поясницы"], ["Iliocostalis lumborum muscle", "мышца, выпрямляющая позвоночник"], ["Gluteus maximus muscle", "большая ягодичная"], ["Transversus abdominis muscle", "поперечная мышца живота"], ["Acromial part of deltoid muscle", "дельтовидная"]],
    cues: ["Рука и противоположная нога тянутся в длину, а не вверх", "Таз не поворачивается и не наклоняется", "Медленно, с паузой в конце"],
    caution: "Начните с отдельного подъёма руки или ноги, если тело раскачивается."
  },
  walk: {
    goal: "Ходьба: работа ног и стабилизация таза в каждом шаге.",
    muscles: [["Gluteus medius muscle", "средняя ягодичная"], ["Rectus femoris muscle", "прямая мышца бедра"], ["Long head of biceps femoris", "двуглавая мышца бедра"], ["Medial head of gastrocnemius", "икроножная"], ["Tibialis anterior muscle", "передняя большеберцовая"]],
    cues: ["Касание пяткой, перекат, толчок носком", "Руки идут навстречу ногам", "Взгляд вперёд"],
    caution: ""
  }
};
INFO.lower_back = { goal: "Комплекс на полу: растяжка, ягодичный мостик, подвижность и устойчивость поясницы.", muscles: INFO.bird_dog.muscles.concat(INFO.bridge.muscles.slice(0, 2)),
  cues: ["Всё медленно и без боли", "Дыхание не задерживается"], caution: "При острой боли в спине комплекс не выполняется." };
INFO.lower_back_standing = { goal: "Разминка стоя: подвижность поясницы во всех направлениях.", muscles: INFO.side_bends.muscles.concat(INFO.cat_cow.muscles.slice(1)),
  cues: ["Плавно, в комфортной амплитуде"], caution: INFO.forward_bend.caution };
