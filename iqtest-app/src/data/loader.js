export async function loadQuizPack(packName = 'questions.v1') {
  const res = await fetch(`/questions/${packName}.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load pack ${packName}`);
  return res.json();
}
