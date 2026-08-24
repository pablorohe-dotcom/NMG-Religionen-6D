import assert from 'node:assert/strict';
import { buildAdaptiveRound, questions, shuffleIndices, topics } from '../lib/training.ts';

assert.equal(questions.length, 100, 'the bank must contain 100 questions');
assert.equal(new Set(questions.map(({ id }) => id)).size, questions.length, 'question ids must be unique');
assert.equal(new Set(questions.map(({ prompt }) => prompt)).size, questions.length, 'question prompts must be unique');

for (const topic of topics) {
  assert.equal(questions.filter((question) => question.topic === topic).length, 20, `${topic} must contain 20 questions`);
}

for (const question of questions) {
  assert.equal(question.options.length, 3, `${question.id} must contain three options`);
  assert.ok(question.answer >= 0 && question.answer < question.options.length, `${question.id} must have a valid answer`);
}

const firstQuestions = new Set<string>();
for (let seed = 1; seed <= 30; seed += 1) {
  let state = seed;
  const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
  const round = buildAdaptiveRound('Christentum', {}, { random });
  assert.equal(round.length, 12, 'topic rounds must contain twelve questions');
  assert.equal(new Set(round).size, round.length, 'a round must never repeat a question');
  firstQuestions.add(round[0]);
}
assert.ok(firstQuestions.size > 5, 'rounds must start in varied order');

const positions = new Set<number>();
for (let seed = 1; seed <= 30; seed += 1) {
  let state = seed;
  const random = () => ((state = (state * 1103515245 + 12345) >>> 0) / 4294967296);
  positions.add(shuffleIndices(3, random).indexOf(0));
}
assert.deepEqual([...positions].sort(), [0, 1, 2], 'correct answers must appear in every position');

const wrongId = 'c1';
const masteredId = 'c2';
const itemStats = Object.fromEntries(questions.map(({ id }) => [id, { attempts: 5, correct: 5 }]));
itemStats[wrongId] = { attempts: 5, correct: 0 };
let wrongSelections = 0;
let masteredSelections = 0;
for (let seed = 1; seed <= 600; seed += 1) {
  let state = seed;
  const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
  const selected = buildAdaptiveRound('Christentum', itemStats, { size: 1, random })[0];
  if (selected === wrongId) wrongSelections += 1;
  if (selected === masteredId) masteredSelections += 1;
}
assert.ok(wrongSelections > masteredSelections * 2, 'failed questions must be selected much more often than mastered questions');

console.log(`Validated ${questions.length} questions, unique rounds, shuffled answers and adaptive weighting.`);
