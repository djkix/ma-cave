-- unaccent_lower appelait unaccent() sans schéma : l'analyse automatique de
-- PostgreSQL (autovacuum), qui tourne avec un search_path réduit, ne trouvait
-- pas la fonction en évaluant l'index trigramme des appellations et le notait
-- en erreur dans les journaux (« function unaccent(text) does not exist »).
-- Schéma et dictionnaire nommés en entier : même résultat, quel que soit le
-- search_path. Rien n'est modifié ni supprimé dans les données ; l'index est
-- reconstruit par précaution (table de référence, quelques milliers de lignes).
CREATE OR REPLACE FUNCTION unaccent_lower(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT lower(public.unaccent('public.unaccent'::regdictionary, $1)) $$;
REINDEX INDEX idx_appellation_name_trgm;
