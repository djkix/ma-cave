import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BottomSheet } from '../components/BottomSheet';
import { BottomNav } from '../components/BottomNav';
import { HORS_FRANCE } from '../components/FranceMap';
import { TopBar } from '../components/TopBar';
import { Icon } from '../components/Icon';
import { WineThumb } from '../components/WineThumb';
import { CaveFilter, getCave, Tannin, WineColor } from '../lib/api-client';
import { apogeeShortLabel } from '../lib/apogee';
import { apogeeTone, caveSummary } from '../lib/cave-list';
import { useCurrentCave } from '../lib/use-current-cave';
import { regionCounts } from '../lib/region-counts';
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
  const [vintage, setVintage] = useState('');
  const [tannin, setTannin] = useState<Tannin | ''>('');
  const [q, setQ] = useState(params.get('q') ?? '');
  const [color, setColor] = useState<WineColor | ''>('');
  const [includeEmpty, setIncludeEmpty] = useState(false);
  const [dish, setDish] = useState('');
  // Id d'emplacement, `none` pour « Sans emplacement », vide pour tous.
  const [location, setLocation] = useState('');
  const locations = useLocations();
  // Même condition que la barre du bas pour Entrée et Sortie : lecture seule = ni photo d'étiquette ni ajout.
  const { isOwner } = useCurrentCave();
  // Un seul filtre d'apogée à la fois : « à boire en priorité » exclut par définition les vins sans estimation.
  const [apogeeFilter, setApogeeFilter] = useState<'' | 'drinkSoon' | 'noApogee'>(FILTER_FROM_URL[params.get('filtre') ?? ''] ?? '');
  const base: CaveFilter = { q, color: color || undefined, includeEmpty, ...(dish.trim() ? { dish: dish.trim() } : {}), ...(location ? { location } : {}),
    ...(aromas.length ? { aromas } : {}),
    ...(vintage && Number.isFinite(Number(vintage)) ? { vintageMin: Math.trunc(Number(vintage)), vintageMax: Math.trunc(Number(vintage)) } : {}),
    ...(tannin ? { tannin } : {}), ...(region ? { region } : {}) };
  const toggleRegion = (r: string) => setParams((p) => { if (region === r) p.delete('region'); else p.set('region', r); return p; }, { replace: true });
  // Régions proposées : celles de la cave entière (même requête que l'accueil, donc en cache), pas de la liste filtrée.
  const all = useQuery({ queryKey: ['cave', {}], queryFn: () => getCave({}) });
  const counts = regionCounts(all.data ?? []);
  const regionCount = (r: string) => (r === HORS_FRANCE ? counts.horsFrance.bottles : counts.byRegion.get(r)?.bottles);
  const regionPills = [...counts.byRegion.keys()].sort((a, b) => a.localeCompare(b, 'fr')).map((r) => ({ value: r, label: r }));
  if (counts.horsFrance.producers.length) regionPills.push({ value: HORS_FRANCE, label: 'Hors de France' });
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
  const summary = cave.data ? caveSummary(cave.data) : null;
  const toggle = (which: 'drinkSoon' | 'noApogee') => (checked: boolean) => setApogeeFilter(checked ? which : '');

  return (
    <>
      <TopBar title="La cave" />
      <main className="page cave-page">
        <section className="cave-filters">
          <div className="cave-search">
            <Icon name="search" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Domaine, cuvée, appellation…" aria-label="Rechercher" />
            {isOwner && <Link to="/sortie" className="cave-search__photo" aria-label="Reconnaître une étiquette par photo"><Icon name="photo_camera" /></Link>}
          </div>
          <div className="cave-search cave-search--dish">
            <Icon name="restaurant" />
            <input type="search" value={dish} onChange={(e) => setDish(e.target.value)} placeholder="Accords : Agneau, comté, poisson…" aria-label="Accompagner un plat" maxLength={100} />
          </div>
          <div className="cave-pills">
            {/* Libellé relié par htmlFor : enveloppé dans le <label>, le select aurait
                pour nom accessible « Couleur » suivi du texte de toutes ses options.
                Pastilles : le libellé est dans l'option vide (« Couleur : toutes ») ;
                le <label> reste pour le nom accessible, caché à l'écran. */}
            <label htmlFor="cave-color" className="visually-hidden">Couleur</label>
            <select id="cave-color" className={`filter-pill${color ? ' filter-pill--on' : ''}`} value={color} onChange={(e) => setColor(e.target.value as WineColor | '')}>
              {COLORS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <button type="button" className={`filter-pill filter-pill--btn${aromas.length ? ' filter-pill--on' : ''}`} onClick={() => setAromasOpen(true)}>{aromasLabel}</button>
            <span className="filter-vintage">
              <input type="number" inputMode="numeric" min={1900} max={2100} value={vintage} onChange={(e) => setVintage(e.target.value)} placeholder="Millésime" aria-label="Millésime" />
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
          </div>
          {regionPills.length > 0 && (
            <div className="cave-pills">
              {regionPills.map((r) => (
                <button key={r.value} type="button" aria-pressed={region === r.value} className={`filter-pill filter-pill--btn${region === r.value ? ' filter-pill--on' : ''}`} onClick={() => toggleRegion(r.value)}>
                  {r.label}{regionCount(r.value) != null && <span className="cave-pills__count" aria-hidden="true">{regionCount(r.value)}</span>}
                </button>
              ))}
            </div>
          )}
          <div className="cave-pills">
            <label className="filter-toggle">
              <input type="checkbox" className="visually-hidden" checked={apogeeFilter === 'drinkSoon'} onChange={(e) => toggle('drinkSoon')(e.target.checked)} aria-label="À boire en priorité" />
              <Icon name="priority_high" />À boire en priorité
            </label>
            <label className="filter-toggle">
              <input type="checkbox" className="visually-hidden" checked={includeEmpty} onChange={(e) => setIncludeEmpty(e.target.checked)} aria-label="Afficher les vins épuisés" />
              <Icon name="inventory_2" />Vins épuisés
            </label>
            <label className="filter-toggle">
              <input type="checkbox" className="visually-hidden" checked={apogeeFilter === 'noApogee'} onChange={(e) => toggle('noApogee')(e.target.checked)} aria-label="Sans apogée" />
              Sans apogée
            </label>
          </div>
        </section>
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
        {summary && <p className="cave-summary"><strong>{summary.bottles}</strong><span>{summary.references}</span></p>}
        {cave.data?.length === 0 && <p className="centered">Aucun vin ne correspond.</p>}
        <div className="list">
          {cave.data?.map((w) => {
            const empty = w.quantity <= 0;
            const label = w.apogee && apogeeShortLabel(w.apogee);
            const tone = w.apogee && apogeeTone(w.apogee);
            return (
              <Link key={w.id} to={`/cave/${w.id}`} className={`cave-row${empty ? ' cave-row--empty' : ''}`}>
                <span className="cave-row__thumb">
                  <WineThumb photoId={w.referencePhotoId} size={52} />
                  <span className={`cave-row__dot cave-row__dot--${w.color}`} aria-hidden="true" />
                </span>
                <span className="cave-row__body">
                  <span className="cave-row__name">
                    {w.producer}{w.cuvee ? ` — ${w.cuvee}` : ''} {w.vintage ?? 'NV'}
                  </span>
                  <span className="list__meta">{w.appellationRaw} · {COLORS.find((c) => c.value === w.color)?.label}</span>
                  <span className="cave-row__chips">
                    {label && tone && <span className={`cave-chip cave-chip--${tone.tone}`}><Icon name={tone.icon} />{label}</span>}
                    {label && w.apogee?.source === 'IA' && <em className="cave-row__ia">(estimée IA)</em>}
                    {w.rating && <span className="cave-chip cave-chip--plain num"><Icon name="star" />{formatRatingShort(w.rating.value)}</span>}
                    {empty && <span className="cave-chip cave-chip--plain"><Icon name="shopping_cart" />Épuisé</span>}
                  </span>
                  {w.matchedDish && <span className="list__meta">{`avec : ${w.matchedDish}`}</span>}
                </span>
                <span className="cave-row__qty num">{w.quantity}<small>btl</small></span>
              </Link>
            );
          })}
        </div>
        {isOwner && <Link to="/entree" className="cave-fab"><Icon name="add" />Ajouter un vin</Link>}
      </main>
      <BottomNav />
    </>
  );
}
