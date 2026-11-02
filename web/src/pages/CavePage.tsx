import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BottomSheet } from '../components/BottomSheet';
import { BottomNav } from '../components/BottomNav';
import { HORS_FRANCE } from '../components/FranceMap';
import { TopBar } from '../components/TopBar';
import { WineThumb } from '../components/WineThumb';
import { CaveFilter, getCave, Tannin, WineColor } from '../lib/api-client';
import { apogeeShortLabel } from '../lib/apogee';
import { NO_LOCATION, useLocations } from '../lib/locations';
import { formatRatingShort } from '../lib/rating';
import { AROMAS, MAX_AROMAS, TANNIN_LABEL } from '../lib/traits';

const COLORS: Array<{ value: WineColor | ''; label: string }> = [
  { value: '', label: 'Couleur : toutes' }, { value: 'ROUGE', label: 'Rouge' }, { value: 'BLANC', label: 'Blanc' },
  { value: 'ROSE', label: 'Rosé' }, { value: 'PETILLANT', label: 'Pétillant' },
];

/** Filtre d'apogée demandé par un lien (page Statistiques) : `?filtre=priorite` ou `?filtre=sans-apogee`. */
const FILTER_FROM_URL: Record<string, 'drinkSoon' | 'noApogee'> = { priorite: 'drinkSoon', 'sans-apogee': 'noApogee' };


export function CavePage() {
  const [params, setParams] = useSearchParams();
  const region = params.get('region') ?? '';
  const [aromas, setAromas] = useState<string[]>([]);
  const [aromasOpen, setAromasOpen] = useState(false);
  const [vintageMin, setVintageMin] = useState('');
  const [vintageMax, setVintageMax] = useState('');
  const [tannin, setTannin] = useState<Tannin | ''>('');
  const [q, setQ] = useState(params.get('q') ?? '');
  const [color, setColor] = useState<WineColor | ''>('');
  const [includeEmpty, setIncludeEmpty] = useState(false);
  const [dish, setDish] = useState('');
  // Id d'emplacement, `none` pour « Sans emplacement », vide pour tous.
  const [location, setLocation] = useState('');
  const locations = useLocations();
  // Un seul filtre d'apogée à la fois : « à boire en priorité » exclut par définition les vins sans estimation.
  const [apogeeFilter, setApogeeFilter] = useState<'' | 'drinkSoon' | 'noApogee'>(FILTER_FROM_URL[params.get('filtre') ?? ''] ?? '');
  const base: CaveFilter = { q, color: color || undefined, includeEmpty, ...(dish.trim() ? { dish: dish.trim() } : {}), ...(location ? { location } : {}),
    ...(aromas.length ? { aromas } : {}), ...(Number.isFinite(Number(vintageMin)) && vintageMin ? { vintageMin: Math.trunc(Number(vintageMin)) } : {}),
    ...(Number.isFinite(Number(vintageMax)) && vintageMax ? { vintageMax: Math.trunc(Number(vintageMax)) } : {}),
    ...(tannin ? { tannin } : {}), ...(region ? { region } : {}) };
  const clearRegion = () => setParams((p) => { p.delete('region'); return p; }, { replace: true });
  const aromasLabel = aromas.length ? `Arômes : ${aromas.join(', ')}` : 'Arômes : tous';
  const filter: CaveFilter = apogeeFilter ? { ...base, [apogeeFilter]: true } : base;
  const cave = useQuery({ queryKey: ['cave', filter], queryFn: () => getCave(filter) });
  // Avec « à boire en priorité », les vins sans estimation ne sont pas oubliés : on les compte à part.
  const missingFilter: CaveFilter = { ...base, noApogee: true };
  const missing = useQuery({
    queryKey: ['cave', missingFilter],
    queryFn: () => getCave(missingFilter),
    enabled: apogeeFilter === 'drinkSoon',
  });
  const missingCount = apogeeFilter === 'drinkSoon' ? missing.data?.length ?? 0 : 0;
  const toggle = (which: 'drinkSoon' | 'noApogee') => (checked: boolean) => setApogeeFilter(checked ? which : '');

  return (
    <>
      <TopBar title="La cave" />
      <main className="page">
        <section className="cave-filters">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Domaine, cuvée, appellation…" aria-label="Rechercher" />
          {/* Libellé relié par htmlFor : enveloppé dans le <label>, le select aurait
              pour nom accessible « Couleur » suivi du texte de toutes ses options. */}
          {/* Pastilles : le libellé est dans l'option vide (« Couleur : toutes ») ;
              le <label> reste pour le nom accessible, caché à l'écran. */}
          <label htmlFor="cave-color" className="visually-hidden">Couleur</label>
          <select id="cave-color" className={`filter-pill${color ? ' filter-pill--on' : ''}`} value={color} onChange={(e) => setColor(e.target.value as WineColor | '')}>
            {COLORS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <button type="button" className={`filter-pill filter-pill--btn${aromas.length ? ' filter-pill--on' : ''}`} onClick={() => setAromasOpen(true)}>{aromasLabel}</button>
          <span className="filter-vintage">
            <input type="number" inputMode="numeric" min={1900} max={2100} value={vintageMin} onChange={(e) => setVintageMin(e.target.value)} placeholder="Millésime de" aria-label="Millésime de" />
            <input type="number" inputMode="numeric" min={1900} max={2100} value={vintageMax} onChange={(e) => setVintageMax(e.target.value)} placeholder="à" aria-label="Millésime à" />
          </span>
          <label htmlFor="cave-tannin" className="visually-hidden">Tanin</label>
          <select id="cave-tannin" className={`filter-pill${tannin ? ' filter-pill--on' : ''}`} value={tannin} onChange={(e) => setTannin(e.target.value as Tannin | '')}>
            <option value="">Tanin : tous</option>
            {(Object.keys(TANNIN_LABEL) as Tannin[]).map((t) => <option key={t} value={t}>{TANNIN_LABEL[t]}</option>)}
          </select>
          <label htmlFor="cave-location" className="visually-hidden">Emplacement</label>
          <select id="cave-location" className={`filter-pill${location ? ' filter-pill--on' : ''}`} value={location} onChange={(e) => setLocation(e.target.value)}>
            <option value="">Emplacement : tous</option>
            {locations.data?.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            <option value="none">{NO_LOCATION}</option>
          </select>
          <label className="filter-toggle">
            <input type="checkbox" className="visually-hidden" checked={apogeeFilter === 'drinkSoon'} onChange={(e) => toggle('drinkSoon')(e.target.checked)} aria-label="À boire en priorité" />
            À boire en priorité
          </label>
          <label className="filter-toggle">
            <input type="checkbox" className="visually-hidden" checked={apogeeFilter === 'noApogee'} onChange={(e) => toggle('noApogee')(e.target.checked)} aria-label="Sans apogée" />
            Sans apogée
          </label>
          <label className="filter-toggle">
            <input type="checkbox" className="visually-hidden" checked={includeEmpty} onChange={(e) => setIncludeEmpty(e.target.checked)} aria-label="Afficher les vins épuisés" />
            Vins épuisés
          </label>
          <input type="search" value={dish} onChange={(e) => setDish(e.target.value)} placeholder="Agneau, comté, poisson…" aria-label="Accompagner un plat" maxLength={100} />
        </section>
        {region && (
          <button type="button" className="filter-pill filter-pill--on" onClick={clearRegion}>
            {`Région : ${region === HORS_FRANCE ? 'Hors de France' : region} ✕`}
          </button>
        )}
        <BottomSheet open={aromasOpen} title="Arômes" onClose={() => setAromasOpen(false)}>
          <div className="cave-filters">
            {AROMAS.map((a) => {
              const on = aromas.includes(a);
              return (
                <label key={a} className="filter-toggle">
                  <input type="checkbox" className="visually-hidden" checked={on} disabled={!on && aromas.length >= MAX_AROMAS} aria-label={a}
                    onChange={() => setAromas((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]))} />
                  {a}
                </label>
              );
            })}
          </div>
        </BottomSheet>
        {apogeeFilter === 'drinkSoon' && missing.isError && (
          <p role="alert" className="text-error">Impossible de compter les vins sans apogée.</p>
        )}
        {missingCount > 0 && (
          <aside className="banner" role="status">
            <span>{`${missingCount} ${missingCount > 1 ? 'vins' : 'vin'} sans apogée estimée`}</span>
            <button type="button" className="btn btn--outline" onClick={() => setApogeeFilter('noApogee')}>À compléter</button>
          </aside>
        )}
        {cave.isError && <p role="alert" className="text-error">Impossible de charger la cave.</p>}
        {cave.data?.length === 0 && <p className="centered">Aucun vin ne correspond.</p>}
        <div className="list">
          {cave.data?.map((w) => (
            <Link key={w.id} to={`/cave/${w.id}`} className="cave-row" style={{ opacity: w.quantity > 0 ? 1 : 0.55 }}>
              <WineThumb photoId={w.referencePhotoId} size={44} />
              <span style={{ minWidth: 0 }}>
                <span className="list__title" style={{ display: 'block' }}>
                  {w.producer}{w.cuvee ? ` — ${w.cuvee}` : ''} {w.vintage ?? 'NV'}
                </span>
                <span className="list__meta">{w.appellationRaw} · {COLORS.find((c) => c.value === w.color)?.label}</span>
                {w.apogee && apogeeShortLabel(w.apogee) && (
                  <span className="list__meta" style={{ display: 'block' }}>{apogeeShortLabel(w.apogee)}</span>
                )}
                {w.rating && <span className="list__meta num" style={{ display: 'block' }}>{formatRatingShort(w.rating.value)}</span>}
                {w.matchedDish && <span className="list__meta" style={{ display: 'block' }}>{`avec : ${w.matchedDish}`}</span>}
              </span>
              <span className="cave-row__qty num">{w.quantity}</span>
            </Link>
          ))}
        </div>
      </main>
      <BottomNav />
    </>
  );
}
