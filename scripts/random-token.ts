import { randomBytes } from 'crypto';

const len = Number(process.argv[2] ?? 32);
console.log(randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len));
