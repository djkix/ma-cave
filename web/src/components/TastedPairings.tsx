import { useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { addTastedPairing, deleteTastedPairing, TastedPairing } from '../lib/api-client';
import { DISHES } from '../lib/accords-base/data';
import { findDishes, normalizeDish, suggestDishes } from '../lib/accords-base/match';
import { DishEntry } from '../lib/accords-base/types';
import { Button } from './Button';
import { Icon } from './Icon';

/** Fiche et classement des accords à relire après un ajout ou une suppression. */
const refresh = (qc: ReturnType<typeof useQueryClient>, wineId: string) =>
  Promise.all([qc.invalidateQueries({ queryKey: ['wine', wineId] }), qc.invalidateQueries({ queryKey: ['tasted'] })]);

/**
 * « Avec quel plat ? » : le plat (suggestions de la base d'accords), puis l'avis.
 * L'entrée choisie dans les suggestions prime ; sinon la dominante reconnue dans
 * le texte ; sinon aucune (l'accord est gardé, sans effet sur le classement).
 */
export function TastedPairingForm({ wineId, onDone }: { wineId: string; onDone?: () => void }) {
  const qc = useQueryClient();
  const [dish, setDish] = useState('');
  const [picked, setPicked] = useState<DishEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = dish.trim();
  const suggestions = picked && normalizeDish(picked.name) === normalizeDish(dish) ? [] : suggestDishes(dish, DISHES, 4);

  async function save(good: boolean) {
    if (!clean) return;
    setBusy(true);
    setError(null);
    try {
      const entry = picked && normalizeDish(picked.name) === normalizeDish(clean) ? picked : findDishes(clean, DISHES)[0];
      await addTastedPairing(wineId, { dish: clean, dishId: entry?.id ?? null, good });
      setDish('');
      setPicked(null);
      void refresh(qc, wineId);
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="tasted-form" onSubmit={(e: FormEvent) => e.preventDefault()}>
      <label className="field__label" htmlFor={`tasted-dish-${wineId}`}>Avec quel plat ?</label>
      <input id={`tasted-dish-${wineId}`} value={dish} maxLength={100} autoComplete="off" placeholder="Ex. poulet aux morilles"
        onChange={(e) => { setDish(e.target.value); setPicked(null); }} />
      {suggestions.length > 0 && (
        <ul className="accords-suggest" aria-label="Suggestions">
          {suggestions.map((d) => (
            <li key={d.id}><button type="button" className="accords-chip" onClick={() => { setDish(d.name); setPicked(d); }}>{d.name}</button></li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="text-error" style={{ margin: 0 }}>{error}</p>}
      <div className="tasted-form__verdict">
        <Button variant="outline" disabled={!clean || busy} onClick={() => void save(true)}><Icon name="thumb_up" />Bon accord</Button>
        <Button variant="outline" disabled={!clean || busy} onClick={() => void save(false)}><Icon name="thumb_down" />Accord raté</Button>
      </div>
    </form>
  );
}

/** Bloc de la fiche : accords vécus (chaque plat ouvre « Accords »), ajout et retrait par le propriétaire. */
export function TastedPairingsBlock({ wineId, items, readOnly = false }: { wineId: string; items: TastedPairing[]; readOnly?: boolean }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove(id: string) {
    setError(null);
    try {
      await deleteTastedPairing(id);
      void refresh(qc, wineId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Suppression impossible');
    }
  }

  if (readOnly && items.length === 0) return null;
  return (
    <section className="card">
      <h3 className="wine-card__title"><Icon name="restaurant_menu" />Accords vécus</h3>
      {items.length === 0 && !adding && <p className="list__meta" style={{ margin: 0 }}>Notez les plats servis avec ce vin : ils comptent dans les accords proposés.</p>}
      {items.length > 0 && (
        <ul className="tasted-list">
          {items.map((t) => (
            <li key={t.id}>
              <Icon name={t.good ? 'thumb_up' : 'thumb_down'} />
              <span className="tasted-list__dish">
                <Link to={`/accords?plat=${encodeURIComponent(t.dish)}`}>{t.dish}</Link>
                <span className="list__meta">{t.good ? 'Bon accord' : 'Accord raté'}</span>
              </span>
              {!readOnly && <Button variant="link" aria-label={`Retirer ${t.dish}`} onClick={() => void remove(t.id)}>Retirer</Button>}
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="text-error">{error}</p>}
      {!readOnly && (adding
        ? <><TastedPairingForm wineId={wineId} onDone={() => setAdding(false)} /><Button variant="link" onClick={() => setAdding(false)}>Abandonner</Button></>
        : <Button variant="outline" onClick={() => setAdding(true)}>Ajouter un plat</Button>)}
    </section>
  );
}
