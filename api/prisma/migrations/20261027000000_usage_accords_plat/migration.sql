-- Journal des appels Gemini : nouvel usage ACCORDS_PLAT (« Accords vins » :
-- vins de la cave proposés pour un plat).
ALTER TABLE "gemini_call" DROP CONSTRAINT "gemini_call_usage_check";
ALTER TABLE "gemini_call" ADD CONSTRAINT "gemini_call_usage_check"
  CHECK ("usage" IN ('LECTURE_ENTREE', 'LECTURE_SORTIE', 'ACCORDS', 'DESCRIPTIF', 'RECHERCHE_IMAGE', 'ANALYSE_PLAN', 'ACCORDS_PLAT'));
