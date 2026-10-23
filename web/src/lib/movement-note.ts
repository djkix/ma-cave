/** Ce que désigne une annulation : « Annulation de la sortie du 23 oct. 2026, 14:02 ». */
const KIND = { IN: "de l'entrée", OUT: 'de la sortie', ADJUST: 'de la correction', MOVE: 'du déplacement' } as const;
const when = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
/** Note écrite par l'api avant la 2.34 : l'identifiant technique du mouvement annulé. */
const OLD_NOTE = /^Annulation du mouvement [0-9a-f-]{36}$/i;

type Moved = { id: string; type: keyof typeof KIND; occurredAt: string; note: string | null; reversesId: string | null };

/**
 * Note affichée d'un mouvement. Une annulation montre ce qu'elle annule (type
 * et date du mouvement d'origine, cherché dans `all`), jamais un identifiant ;
 * origine absente de la liste : « Annulation d'un mouvement ».
 */
export function movementNote(m: Moved, all: readonly Moved[]): string | null {
  if (!m.reversesId || (m.note !== null && !OLD_NOTE.test(m.note))) return m.note;
  const original = all.find((o) => o.id === m.reversesId);
  return original ? `Annulation ${KIND[original.type]} du ${when.format(new Date(original.occurredAt))}` : 'Annulation d’un mouvement';
}
