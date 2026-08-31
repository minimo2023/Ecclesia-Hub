import bcrypt from 'bcryptjs';
import { writeFileSync } from 'fs';

const passwordHash = bcrypt.hashSync('admin888', 10);
const answerHash = bcrypt.hashSync('耶穌', 10);

writeFileSync('server/hashes.txt', `PASSWORD_HASH: ${passwordHash}\nANSWER_HASH: ${answerHash}\n`);
console.log('Done! Check server/hashes.txt');
