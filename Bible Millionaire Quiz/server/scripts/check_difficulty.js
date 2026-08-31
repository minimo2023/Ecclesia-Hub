import { dbOps } from '../database/index.js';

const difficulties = dbOps.gamesDb.prepare('SELECT DISTINCT difficulty FROM questions').all();
console.log('Distinct difficulties:', difficulties);
