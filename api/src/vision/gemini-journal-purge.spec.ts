import { purgeGeminiJournal } from './gemini-journal-purge';

it('efface seulement les appels plus vieux que la durée de conservation', async () => {
  const deleteMany = jest.fn().mockResolvedValue({ count: 3 });
  const count = await purgeGeminiJournal({ geminiCall: { deleteMany } } as never, 365, new Date('2026-10-23T00:00:00Z'));
  expect(count).toBe(3);
  expect(deleteMany).toHaveBeenCalledWith({ where: { createdAt: { lt: new Date('2025-10-23T00:00:00Z') } } });
});
