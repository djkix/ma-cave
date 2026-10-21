-- Journal des appels Gemini : nouvel usage ANALYSE_PLAN (analyse de la photo
-- d'un plan, propositions de zones).
ALTER TABLE "gemini_call" DROP CONSTRAINT "gemini_call_usage_check";
ALTER TABLE "gemini_call" ADD CONSTRAINT "gemini_call_usage_check"
  CHECK ("usage" IN ('LECTURE_ENTREE', 'LECTURE_SORTIE', 'ACCORDS', 'DESCRIPTIF', 'RECHERCHE_IMAGE', 'ANALYSE_PLAN'));
