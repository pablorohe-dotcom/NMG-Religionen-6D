import assert from 'node:assert/strict';
import { buildAdaptiveRound, questions, shuffleIndices, topics } from '../lib/training.ts';

assert.equal(questions.length, 200, 'the bank must contain 200 questions');
assert.equal(new Set(questions.map(({ id }) => id)).size, questions.length, 'question ids must be unique');
assert.equal(new Set(questions.map(({ prompt }) => prompt)).size, questions.length, 'question prompts must be unique');
for (const topic of topics) assert.equal(questions.filter((question) => question.topic === topic).length, 40, `${topic} must contain 40 questions`);
for (const question of questions) {
  assert.equal(question.options.length, 3, `${question.id} must contain three options`);
  assert.ok(question.answer >= 0 && question.answer < question.options.length, `${question.id} must have a valid answer`);
  const prompt = question.prompt.toLocaleLowerCase('de-CH').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const correctAnswer = question.options[question.answer].toLocaleLowerCase('de-CH').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  assert.ok(!prompt.includes(correctAnswer), `${question.id} must not reveal the complete answer in its prompt`);
}
const firstQuestions = new Set<string>();
for (let seed = 1; seed <= 30; seed += 1) {
  let state = seed;
  const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
  const round = buildAdaptiveRound('Buddhismus', {}, { random });
  assert.equal(round.length, 12);
  assert.equal(new Set(round).size, round.length);
  assert.equal(new Set(round.map((id) => id.replace(/[ab]$/, ''))).size, round.length, 'a round must contain only one variant per concept');
  firstQuestions.add(round[0]);
}
assert.ok(firstQuestions.size > 5);
for (const filter of ['Alle', ...topics] as const) {
  for (let seed = 1; seed <= 100; seed += 1) {
    let state = seed;
    const random = () => ((state = (state * 22695477 + 1) >>> 0) / 4294967296);
    const round = buildAdaptiveRound(filter, {}, { random });
    assert.equal(new Set(round.map((id) => id.replace(/[ab]$/, ''))).size, round.length, `${filter} round ${seed} repeats a concept`);
  }
}
const sameConceptMistakes = buildAdaptiveRound('Buddhismus', {}, { onlyIds: ['b5a', 'b5b'], size: 2, random: () => 0.5 });
assert.equal(sameConceptMistakes.length, 1, 'mistake rounds must not repeat two variants of the same concept');
const positions = new Set<number>();
for (let seed = 1; seed <= 30; seed += 1) {
  let state = seed;
  const random = () => ((state = (state * 1103515245 + 12345) >>> 0) / 4294967296);
  positions.add(shuffleIndices(3, random).indexOf(0));
}
assert.deepEqual([...positions].sort(), [0, 1, 2]);
const itemStats = Object.fromEntries(questions.map(({ id }) => [id, { attempts: 5, correct: 5 }]));
itemStats.b1a = { attempts: 5, correct: 0 };
let wrongSelections = 0;
let masteredSelections = 0;
for (let seed = 1; seed <= 2000; seed += 1) {
  let state = seed;
  const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
  const selected = buildAdaptiveRound('Buddhismus', itemStats, { size: 1, random })[0];
  if (selected === 'b1a') wrongSelections += 1;
  if (selected === 'b1b') masteredSelections += 1;
}
assert.ok(wrongSelections > masteredSelections * 2);
console.log(`Validated ${questions.length} questions, unique rounds, shuffled answers and adaptive weighting.`);
