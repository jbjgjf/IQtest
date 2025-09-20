export async function loadQuizPack(packName = 'questions.v1') {
  const res = await fetch(`/questions/${packName}.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load pack ${packName}`);
  return res.json();
}

export async function loadPacks(packNames) {
  if (!Array.isArray(packNames) || packNames.length === 0) {
    throw new Error('loadPacks requires a non-empty array');
  }

  const responses = await Promise.all(
    packNames.map(async (name) => {
      const res = await fetch(`/questions/${name}.json`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load pack ${name}`);
      const body = await res.json();
      if (!body || !Array.isArray(body.questions)) {
        throw new Error(`Pack ${name} is missing questions array`);
      }
      return { ...body, _pack: name };
    })
  );

  return responses.flatMap((pack) =>
    pack.questions.map((question) => ({ ...question, _pack: pack._pack }))
  );
}
