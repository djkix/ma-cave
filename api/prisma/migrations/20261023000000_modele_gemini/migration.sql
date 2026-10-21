-- Modèle Gemini choisi dans l'Administration : le journal des appels note le
-- modèle employé. Ajout seulement ; appels existants : NULL (modèle inconnu).
ALTER TABLE "gemini_call" ADD COLUMN "model" TEXT;
