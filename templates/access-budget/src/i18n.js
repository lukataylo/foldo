// Tiny dictionary. Add a language by adding a column; keep sentences short and plain.
export const LANGS = { en: 'English', es: 'Español', pl: 'Polski' };

const DICT = {
  overview: { en: 'Overview', es: 'Resumen', pl: 'Przegląd' },
  jars: { en: 'Savings jars', es: 'Huchas', pl: 'Skarbonki' },
  coach: { en: 'Coach', es: 'Entrenador', pl: 'Doradca' },
  left: { en: 'Left this month', es: 'Te queda este mes', pl: 'Zostaje w tym miesiącu' },
  spent: { en: 'Spent', es: 'Gastado', pl: 'Wydane' },
  income: { en: 'Income', es: 'Ingresos', pl: 'Dochód' },
  saved: { en: 'saved', es: 'ahorrado', pl: 'zaoszczędzone' },
  addToJar: { en: 'Add £10', es: 'Añadir £10', pl: 'Dodaj £10' },
  newJar: { en: 'New jar', es: 'Nueva hucha', pl: 'Nowa skarbonka' },
  simple: { en: 'Simple mode', es: 'Modo simple', pl: 'Tryb prosty' },
};

export const makeT = (lang) => (key) => DICT[key]?.[lang] ?? DICT[key]?.en ?? key;
