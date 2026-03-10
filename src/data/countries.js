window.WEATHER_COUNTRIES = {
  BY: {
    code: "BY",
    ru: "Беларусь",
    center: [27.5, 53.9],
    zoom: 6,
    geojson: "data/belarus-gadm.json",
    geojson2: "data/belarus-gadm2.json",
    regions: [
      {
        id: "brest", apiName: "brest", shapeName: "Brest", altNames: ["Brest"], lat: 52.0976, lon: 23.7341,
        cities: [
          { id: "brest-city", name: "Брест", nameEn: "Brest", district: "Brest", lat: 52.0976, lon: 23.7341, about: "Осн. 1019. Один из древнейших городов Беларуси. Название от «берест» — вяз. Знаменит Брестской крепостью — символом стойкости в ВОВ." },
          { id: "baranovichi", name: "Барановичи", nameEn: "Baranovichi", district: "Baranavichy", lat: 53.1327, lon: 26.0139, about: "Осн. 1871 как ж/д станция. Назван по имени помещика Барановского. Крупный ж/д узел Беларуси." },
          { id: "pinsk", name: "Пинск", nameEn: "Pinsk", district: "Pinsk", lat: 52.1115, lon: 26.1032, about: "Осн. 1097. Столица Полесья. Название от реки Пина. Известен уникальной архитектурой барокко и иезуитским коллегиумом." },
          { id: "kobrin", name: "Кобрин", nameEn: "Kobrin", district: "Kobryn", lat: 52.2137, lon: 24.3564, about: "Осн. 1287. Название от реки Кобринка. Здесь находилась усадьба Суворова — ныне военно-исторический музей." },
          { id: "luninets", name: "Лунинец", nameEn: "Luninets", district: "Luninets", lat: 52.2443, lon: 26.8053, about: "Осн. 1449. Назван по имени владельца Лунина. Ж/д узел на пересечении путей Полесья." },
        ],
      },
      {
        id: "vitebsk", apiName: "vitebsk", shapeName: "Vitebsk", altNames: ["Vitsyebsk"], lat: 55.1904, lon: 30.2049,
        cities: [
          { id: "vitebsk-city", name: "Витебск", nameEn: "Vitebsk", district: "Vitebsk", lat: 55.1904, lon: 30.2049, about: "Осн. 974. Родина Марка Шагала. Название от реки Витьба. Ежегодно проводится фестиваль «Славянский базар»." },
          { id: "orsha", name: "Орша", nameEn: "Orsha", district: "Arsha", lat: 54.5081, lon: 30.4172, about: "Осн. 1067. Название от реки Оршица. Здесь в 1941 году впервые были применены «Катюши»." },
          { id: "polotsk", name: "Полоцк", nameEn: "Polotsk", district: "Polatsak", lat: 55.4879, lon: 28.7856, about: "Осн. 862. Древнейший город Беларуси. Родина Евфросинии Полоцкой и Франциска Скорины. Географический центр Европы." },
          { id: "novopolotsk", name: "Новополоцк", nameEn: "Novopolotsk", district: "Polatsak", lat: 55.5318, lon: 28.6488, about: "Осн. 1958 как посёлок нефтяников. Самый молодой город Витебской области. Центр нефтехимической промышленности." },
          { id: "glubokoye", name: "Глубокое", nameEn: "Glubokoye", district: "Hlybokaye", lat: 55.1367, lon: 27.6917, about: "Осн. 1414. Назван по глубоким озёрам в округе. Известен фестивалем вишни и красивыми костёлами." },
        ],
      },
      {
        id: "gomel", apiName: "homyel", shapeName: "Gomel", altNames: ["Homyel"], lat: 52.4412, lon: 30.9878,
        cities: [
          { id: "gomel-city", name: "Гомель", nameEn: "Gomel", district: "Gomyel", lat: 52.4412, lon: 30.9878, about: "Осн. 1142. Название от ручья Гомеюк. Второй по величине город Беларуси. Знаменит дворцово-парковым ансамблем Румянцевых-Паскевичей." },
          { id: "mozyr", name: "Мозырь", nameEn: "Mozyr", district: "Mazyr", lat: 52.0488, lon: 29.2456, about: "Осн. 1155. Единственный город Беларуси с выраженным рельефом — «белорусская Швейцария». Центр нефтепереработки." },
          { id: "zhlobin", name: "Жлобин", nameEn: "Zhlobin", district: "Žlobin", lat: 52.8921, lon: 30.0240, about: "Осн. 1492. Название от слова «жлоб» — желоб реки. Крупнейший металлургический центр Беларуси (БМЗ)." },
          { id: "rechitsa", name: "Речица", nameEn: "Rechitsa", district: "Rechytsa", lat: 52.3615, lon: 30.3930, about: "Осн. 1213. Название от слова «речка». Здесь в 1964 году была добыта первая белорусская нефть." },
          { id: "svetlogorsk", name: "Светлогорск", nameEn: "Svetlogorsk", district: "Svyetlahorsk", lat: 52.6308, lon: 29.7389, about: "Осн. 1560 как Шатилки. Переименован в 1961. Город энергетиков, здесь расположена Светлогорская ТЭЦ." },
        ],
      },
      {
        id: "grodno", apiName: "hrodna", shapeName: "Grodno", altNames: ["Hrodna"], lat: 53.6694, lon: 23.8131,
        cities: [
          { id: "grodno-city", name: "Гродно", nameEn: "Grodno", district: "Hrodna", lat: 53.6694, lon: 23.8131, about: "Осн. 1128. Королевский город ВКЛ. Название от «городить». Сохранил больше всего архитектурных памятников в Беларуси." },
          { id: "lida", name: "Лида", nameEn: "Lida", district: "Lida", lat: 53.8869, lon: 25.2997, about: "Осн. 1323 князем Гедимином. Назван по реке Лидея. Знаменит Лидским замком и пивоваренными традициями с 1876 года." },
          { id: "slonim", name: "Слоним", nameEn: "Slonim", district: "Slonim", lat: 53.0881, lon: 25.3167, about: "Осн. 1252. Название от слова «заслон». В XVIII веке здесь был первый в Беларуси постоянный театр." },
          { id: "volkovysk", name: "Волковыск", nameEn: "Volkovysk", district: "Vawkavysk", lat: 53.1563, lon: 24.4425, about: "Осн. 1005. Название от «волк» и «выск» (лесистое место). Один из древнейших городов Гродненщины." },
          { id: "novogrudok", name: "Новогрудок", nameEn: "Novogrudok", district: "Navahradak", lat: 53.5986, lon: 25.8244, about: "Осн. 1044. Первая столица ВКЛ. Родина Адама Мицкевича. Расположен на самой высокой точке Гродненской области." },
        ],
      },
      {
        id: "minsk", apiName: "minsk", shapeName: "Minsk", altNames: ["Horad Minsk", "Minsk City"], lat: 53.9045, lon: 27.5615,
        cities: [
          { id: "minsk-city", name: "Минск", nameEn: "Minsk", district: "Minsk", lat: 53.9045, lon: 27.5615, about: "Осн. 1067. Столица Беларуси. Название от реки Менка. Город-герой, практически полностью восстановлен после ВОВ. Население — 2 млн." },
          { id: "borisov", name: "Борисов", nameEn: "Borisov", district: "Barysaw", lat: 54.2279, lon: 28.5050, about: "Осн. 1102 князем Борисом. На Березине в 1812 году произошла переправа армии Наполеона — ключевой эпизод войны." },
          { id: "soligorsk", name: "Солигорск", nameEn: "Soligorsk", district: "Salihorsk", lat: 52.7876, lon: 27.5415, about: "Осн. 1958. Название от «соль» и «горск». Центр добычи калийных солей — «Беларуськалий», крупнейший в мире." },
          { id: "molodechno", name: "Молодечно", nameEn: "Molodechno", district: "Maladechna", lat: 54.3107, lon: 26.8324, about: "Осн. 1388. Название от «молодой». Крупный ж/д узел. Здесь в 1944 году был подписан Манифест о независимости БССР." },
          { id: "zhodino", name: "Жодино", nameEn: "Zhodino", district: "Smalyavichy", lat: 54.0982, lon: 28.3341, about: "Осн. 1643. Город БелАЗа — здесь производят крупнейшие в мире карьерные самосвалы грузоподъёмностью до 450 тонн." },
          { id: "slutsk", name: "Слуцк", nameEn: "Slutsk", district: "Slutsak", lat: 53.0268, lon: 27.5597, about: "Осн. 1116. Название от реки Случь. Знаменит Слуцкими поясами — шедеврами ткачества XVIII века." },
        ],
      },
      {
        id: "mogilev", apiName: "mahilyow", shapeName: "Mogilev", altNames: ["Mahilyow"], lat: 53.9007, lon: 30.3314,
        cities: [
          { id: "mogilev-city", name: "Могилёв", nameEn: "Mogilev", district: "Mogilev", lat: 53.9007, lon: 30.3314, about: "Осн. 1267. Название от «могила» (холм). Третий по величине город Беларуси. Мог стать столицей БССР в 1930-х годах." },
          { id: "bobruysk", name: "Бобруйск", nameEn: "Bobruysk", district: "Babruysk", lat: 53.1384, lon: 29.2214, about: "Осн. 1387. Назван от слова «бобр» — бобры водились на реке Березине. Знаменит Бобруйской крепостью 1810 года." },
          { id: "gorki", name: "Горки", nameEn: "Gorki", district: "Horki", lat: 54.2847, lon: 30.9847, about: "Осн. 1544. Назван по холмистому рельефу. Здесь находится старейшая в Беларуси сельхозакадемия (с 1840 года)." },
          { id: "osipovichi", name: "Осиповичи", nameEn: "Osipovichi", district: "Asipovichy", lat: 53.3014, lon: 28.6328, about: "Осн. 1872 как ж/д станция. Назван по деревне Осиповка. Крупный ж/д узел на линии Минск — Гомель." },
          { id: "krichev", name: "Кричев", nameEn: "Krichev", district: "Krychaw", lat: 53.7125, lon: 31.7147, about: "Осн. 1136. Название от «кричь» — болотная руда. Здесь в 1708 году произошла битва со шведами." },
        ],
      },
    ],
  },
};
